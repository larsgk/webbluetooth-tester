// @ts-check
import { html, LitElement } from 'https://unpkg.com/@polymer/lit-element@latest/lit-element.js?module';
import { repeat } from 'https://unpkg.com/lit-html@0.13.0/directives/repeat.js?module';

// todo thingy:52 module

class MatButton extends LitElement {
  render() {
    return html`
      <style>
        .btn {
          display: inline-block;
          position: relative;
          box-sizing: border-box;
          min-width: 5.14em;
          margin: 0 0.29em;
          background: transparent;
          text-align: center;
          font: inherit;
          text-transform: uppercase;
          outline: none;
          border-radius: 3px;
          user-select: none;
          cursor: pointer;
          z-index: 0;
          padding: 0.7em 0.57em;
          box-shadow: 0 2px 2px 0 rgba(0,0,0,0.14), 0 1px 5px 0 rgba(0,0,0,0.12), 0 3px 1px -2px rgba(0,0,0,0.2);
          background-color:rgba(63, 81, 181, 1.0);
          color: white;
        }
        .btn:hover {
          box-shadow: 0 3px 3px 0 rgba(0,0,0,0.14), 0 1px 7px 0 rgba(0,0,0,0.12), 0 3px 1px -1px rgba(0,0,0,0.2);
          background-color:rgba(63, 81, 181, 0.8);
        }
      </style>
      <div class="btn">
        <slot></slot>
      </div>
    `;
  }
}
customElements.define('mat-button', MatButton);

export class MainApp extends LitElement {

  constructor() {
    super();
    this._devices = [];
    this._onTemperatureChange = this._onTemperatureChange.bind(this);
    this._onAccelChange = this._onAccelChange.bind(this);
    this._onButtonChange = this._onButtonChange.bind(this);
  }

  _renderDeviceInfo() {
    if (!this._devices.length) {
      return "N/A";
    }

    return html`
      ${this._devices.map(d => {
        const dataArr = Object.keys(d.data);
        return html`
          ${d.device.name}
          <mat-button class="mini-button" @click='${e => this._detachDevice(d.device)}'>
            DISCONNECT
          </mat-button>:
          <br>
          <ul>
            ${
              repeat(dataArr, (i) => i, (i, idx) => {
                let value = d.data[i];
                if (typeof(value) === "object") {
                  value = JSON.stringify(value);
                }
                return html`<li>${i}: ${value}</li>`
              })
            }
          </ul>
        `
      })}
    `;
  }

  render() {
    return html`
      <style>
        :host {
          font-family: Roboto, Arial;
        }
        .mini-button {
          font-size: 8pt;
        }
        .title {
          font-weight: bold;
        }
      </style>
      <h1>Nordic Thingy:52 - Web Bluetooth Tester</h1>
      <br>
      <mat-button @click='${this._scan}'>CONNECT <b>THINGY:52</b></mat-button>
      <br><br>
      <p>
        <h2 class="title">Devices:</h2><br>
        ${this._renderDeviceInfo()}
      </p>
    `;
  }

  // When the GATT server is disconnected, remove the device from the list
  _deviceDisconnected(device) {
    console.log('Disconnected', device);
    const idx = this._devices.findIndex(dev => dev.device === device);

    if (idx >= 0) {
      this._devices.splice(idx, 1)
      this.requestUpdate();
    }
  }

  // Characteristic notification handlers
  _onTemperatureChange(event) {
    const target = event.target;
    const idx = this._devices.findIndex(dev => dev.device === target.service.device);
    if (idx < 0) {
      return;
    }

    const integer = target.value.getUint8(0);
    const decimal = target.value.getUint8(1);

    this._devices[idx].data.temperature = `${integer}.${decimal}°C`;
    this.requestUpdate();
  }

  _onAccelChange(event) {
    const target = event.target;
    const idx = this._devices.findIndex(dev => dev.device === target.service.device);
    if (idx < 0) {
      return;
    }

    this._devices[idx].data.accel = {
      x: +target.value.getFloat32(0, true).toPrecision(5),
      y: +target.value.getFloat32(4, true).toPrecision(5),
      z: +target.value.getFloat32(8, true).toPrecision(5)
    };

    this.requestUpdate();
  }

  _onButtonChange(event) {
    const target = event.target;
    const idx = this._devices.findIndex(dev => dev.device === target.service.device);
    if (idx < 0) {
      return;
    }

    const device = this._devices[idx];
    const button = device.data.button = target.value.getUint8(0) === 1;

    // set led color to red or green based on button pressed state
    if (device.led) {
      const hexToRGB = hex => hex.match(/[A-Za-z0-9]{2}/g).map(v => parseInt(v, 16));
      const color = hexToRGB(button ? '#ff0000' : '#00ff00');
      return device.led.writeValue(new Uint8Array([1, ...color]));
    }
  }

  // If successful, adds the Thingy:52 to this._devices array
  async _attachDevice(device) {
    // TODO: Can this even happen? Looks defensive.
    if (!device) {
      return;
    }

    // Check that device is not already connected
    if (this._devices.findIndex(dev => dev.device.id === device.id) >= 0) {
      console.log('Device already connected!');
      return;
    }

    const server = await device.gatt.connect();

    await this._startTemperatureNotifications(server);
    await this._startAccelerometerNotifications(server);
    await this._startButtonClickNotifications(server);

    const led = await this._getLedCharacteristic(server);

    this._devices.push({device, led, data: {}});

    device.ongattserverdisconnected = _ => this._deviceDisconnected(device);

    this.requestUpdate();
  }

  async _startTemperatureNotifications(server) {
    const service = await server.getPrimaryService('ef680200-9b35-4933-9b10-52ffa9740042');
    const characteristic = await service.getCharacteristic('ef680201-9b35-4933-9b10-52ffa9740042');
    characteristic.addEventListener('characteristicvaluechanged', this._onTemperatureChange);
    return characteristic.startNotifications();
  }

  async _startAccelerometerNotifications(server) {
    const service = await server.getPrimaryService('ef680400-9b35-4933-9b10-52ffa9740042');
    const characteristic = await service.getCharacteristic('ef68040a-9b35-4933-9b10-52ffa9740042');
    characteristic.addEventListener('characteristicvaluechanged', this._onAccelChange);
    return characteristic.startNotifications();
  }

  async _startButtonClickNotifications(server) {
    const service = await server.getPrimaryService('ef680300-9b35-4933-9b10-52ffa9740042');
    const characteristic = await service.getCharacteristic('ef680302-9b35-4933-9b10-52ffa9740042');
    characteristic.addEventListener('characteristicvaluechanged', this._onButtonChange);
    return characteristic.startNotifications();
  }

  async _getLedCharacteristic(server) {
    const service = await server.getPrimaryService('ef680300-9b35-4933-9b10-52ffa9740042');
    return await service.getCharacteristic('ef680301-9b35-4933-9b10-52ffa9740042');
  }

  async _scan() {
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
    } catch (err) {
      console.log(err); // No device was selected.
    }
  }

  _detachDevice(device) {
    device.gatt.disconnect();
    // results in _deviceDisconnected call.
  }
}
customElements.define('main-app', MainApp);