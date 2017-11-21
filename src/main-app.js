// @ts-check

import {html, render} from '../modules/lit-html/lib/lit-extended.js';
import {repeat} from '../modules/lit-html/lib/repeat.js';

// todo thingy:52 module

export class MainApp extends HTMLElement {

  constructor() {
    super();
    this._devices = [];
    this.attachShadow({mode: 'open'});
  }

  connectedCallback() {
    this.invalidate();
  }

  render() {
      return html`
        <style>
          .btn {
            display: inline-block;
            background: blue;
            color: white;
            margin: 0.4em;
            padding: 0.3em;
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
            font-size: 150%;
            transition: all 0.3s cubic-bezier(.25,.8,.25,1);
          }

          .btn:hover {
            box-shadow: 0 7px 14px rgba(0,0,0,0.5);         
            cursor: pointer;   
          }
        </style>
        <h1>Web Bluetooth Thingy:52 Tester</h1>
        <div class="btn" on-click='${(e)=>this._doScan(e)}'>CONNECT THINGY:52</div>
        <p>Devices: <br>${this._devicesInfo()}</p>
        `;
  }

  // Repaint
  invalidate() {
    if (!this.needsRender) {
      this.needsRender = true;
      Promise.resolve().then(() => {
        this.needsRender = false;
        render(this.render(), this.shadowRoot);
      });
    }
  }

  // When the GATT server is disconnected, remove the device from the list
  _deviceDisconnected(device) {
    console.log('Disconnected', device);
    const idx = this._devices.findIndex(dev => { return dev.device === device; });

    if(idx >= 0) {
      this._devices.splice(idx,1)
      this.invalidate();
    }
  }

  // Characteristic notification handlers
  _onTemperatureData(evt){
    const idx = this._devices.findIndex(dev => { return dev.device === evt.target.service.device; });
    if(idx<0)
      return;

    let integer = evt.target.value.getUint8(0);
    let decimal = evt.target.value.getUint8(1);

    this._devices[idx].data.temperature = integer + '.' + decimal;
    this.invalidate();    
  }

  _onAccelData(evt) {
    const idx = this._devices.findIndex(dev => { return dev.device === evt.target.service.device; });
    if(idx<0)
      return;

    this._devices[idx].data.accel = {
      x: evt.target.value.getFloat32(0, true),
      y: evt.target.value.getFloat32(4, true),
      z: evt.target.value.getFloat32(8, true)      
    };

    this.invalidate();
  }

  _onButtonData(evt) {
    const idx = this._devices.findIndex(dev => { return dev.device === evt.target.service.device; });
    if(idx<0)
      return;

    const thisDev = this._devices[idx]

    thisDev.data.button = evt.target.value.getUint8(0) === 1;

    // set led color to red or green based on button pressed state
    if(thisDev.ledCharacteristic) {
      this._setRGB(thisDev.ledCharacteristic, thisDev.data.button ? 0xff : 0, thisDev.data.button ? 0 : 0xff, 0);
    }
  }

  async _setRGB(ledChar, red, green, blue) {
    let data = new Uint8Array(4);
    data[0] = 1; // constant
    data[1] = red;
    data[2] = green;
    data[3] = blue;

    await ledChar.writeValue(data);
  }

  // If successful, adds the Thingy:52 to this._devices array
  async _attachDevice(device) {
    if(!device)
      return;

    // Check that device is not already connected
    if(this._devices.findIndex(dev => { return dev.device.id === device.id; }) >= 0) {
      console.log('Device already connected!');
      return;
    }

    const server = await device.gatt.connect();

    const devObject = {device:device,data:{}};
    
    await this._beginTempListener(server);
    await this._beginAccelListener(server);
    await this._beginButtonListener(server);
    await this._attachLed(server, devObject);

    this._devices.push(devObject);

    device.ongattserverdisconnected = e => { this._deviceDisconnected(device) };
    
    this.invalidate();    
  }

  async _beginTempListener(server) {
    const service = await server.getPrimaryService('ef680200-9b35-4933-9b10-52ffa9740042');
    const characteristic = await service.getCharacteristic('ef680201-9b35-4933-9b10-52ffa9740042');
    characteristic.addEventListener('characteristicvaluechanged', this._onTemperatureData.bind(this));
    return characteristic.startNotifications();
  }

  async _beginAccelListener(server) {
    const service = await server.getPrimaryService('ef680400-9b35-4933-9b10-52ffa9740042');
    const characteristic = await service.getCharacteristic('ef68040a-9b35-4933-9b10-52ffa9740042');
    characteristic.addEventListener('characteristicvaluechanged', this._onAccelData.bind(this));
    return characteristic.startNotifications();
  }

  async _beginButtonListener(server) {
    const service = await server.getPrimaryService('ef680300-9b35-4933-9b10-52ffa9740042');
    const characteristic = await service.getCharacteristic('ef680302-9b35-4933-9b10-52ffa9740042');
    characteristic.addEventListener('characteristicvaluechanged', this._onButtonData.bind(this));
    return characteristic.startNotifications();
  }

  async _attachLed(server, dev) {
    const service = await server.getPrimaryService('ef680300-9b35-4933-9b10-52ffa9740042');
    // set LED characteristic in respective device obj
    dev.ledCharacteristic = await service.getCharacteristic('ef680301-9b35-4933-9b10-52ffa9740042');    
  }

  async _doScan(evt) {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['ef680100-9b35-4933-9b10-52ffa9740042'] }],
        optionalServices: [
          "ef680200-9b35-4933-9b10-52ffa9740042", 
          "ef680300-9b35-4933-9b10-52ffa9740042",
          "ef680400-9b35-4933-9b10-52ffa9740042",
          "ef680500-9b35-4933-9b10-52ffa9740042"
        ]
      });

      this._attachDevice(device);
    } catch (e) {
      // No device was selected.
      console.log(e);
    }
  }

  _doDisconnect(idx, evt) {
    console.log('_doDisconnect', idx, evt);
    if(this._devices[idx]) {
      console.log(this._devices[idx]);
      this._devices[idx].device.gatt.disconnect();
    }
  }

  _devicesInfo() {
    if(!this._devices.length)
      return "N/A";

    return html`
      <ul>
      ${repeat(this._devices, (d) => d.id, (d, index) => {
        const dataArr = Object.keys(d.data);
        return html`
          <li>${d.device.name} 
          <div class='btn' on-click='${(e)=>this._doDisconnect(index, e)}'>DISCONNECT</div><br>
          </li>
          <ul>
            ${repeat(dataArr, (i) => i, (i, idx) => html`<li>${i}: ${JSON.stringify(d.data[i])}</li>`)}
          </ul>
        `})
      }
      </ul>
    `;
  }

}
customElements.define('main-app', MainApp);
