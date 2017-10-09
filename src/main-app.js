// @ts-check

import {html, render} from '../modules/lit-html/lib/lit-extended.js';
import {repeat} from '../modules/lit-html/lib/repeat.js';

// todo thingy:52 module

export class MainApp extends HTMLElement {

  constructor() {
    super();
    console.log("Constructor");
    this._devices = [];
    this._temperature = {};
    this.attachShadow({mode: 'open'});
  }

  connectedCallback() {
    this.invalidate();
  }

  render() {
      return html`
        <style>
          .btn {
            border: 2px solid black;
          }

          .disabled {
            color: #888;
            font-style: italic;
          }

          code { white-space: pre };
        </style>
        <div>Web Bluetooth Thingy:52 Tester</div><br>
        <button on-click=${(e)=>this._doScan(e)}>CONNECT THINGY:52</button>
        <p>Devices: <br>${this._devicesInfo()}</p>
        `;
  }

  invalidate() {
    if (!this.needsRender) {
      this.needsRender = true;
      Promise.resolve().then(() => {
        this.needsRender = false;
        render(this.render(), this.shadowRoot);
      });
    }
  }

  _deviceDisconnected(device) {
    console.log('Disconnected', device);
    const idx = this._devices.findIndex(dev => { return dev.device === device; });

    if(idx >= 0) {
      this._devices.splice(idx,1)
      this.invalidate();
    }
  }

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

  async _tryAttachDevice(device) {
    console.log('device', device);
    if(!device)
      return;

    // Check that device is not already connected
    if(this._devices.findIndex(dev => { return dev.device.id === device.id; }) >= 0) {
      console.log('Device already connected!');
      return;
    }

    const server = await device.gatt.connect();

    console.log('server', server);

    this._beginTempListener(server);
    this._beginAccelListener(server);

    this._devices.push({device:device,data:{}});

    device.ongattserverdisconnected = e => { this._deviceDisconnected(device) };
    
    this.invalidate();    
  }

  async _beginTempListener(server) {
    const service = await server.getPrimaryService('ef680200-9b35-4933-9b10-52ffa9740042');
    const temperatureChar = await service.getCharacteristic('ef680201-9b35-4933-9b10-52ffa9740042');
    temperatureChar.addEventListener('characteristicvaluechanged', this._onTemperatureData.bind(this));
    temperatureChar.startNotifications();
  }

  async _beginAccelListener(server) {
    const service = await server.getPrimaryService('ef680400-9b35-4933-9b10-52ffa9740042');
    const accelChar = await service.getCharacteristic('ef68040a-9b35-4933-9b10-52ffa9740042');
    accelChar.addEventListener('characteristicvaluechanged', this._onAccelData.bind(this));
    accelChar.startNotifications();
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

      this._tryAttachDevice(device);
    } catch (e) {
      // No device was selected.
      console.log(e);
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
          <li>${d.device.name}</li>
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
