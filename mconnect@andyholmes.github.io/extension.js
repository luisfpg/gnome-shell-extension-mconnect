"use strict";

// Imports
const Lang = imports.lang;
const Signals = imports.signals;
const Main = imports.ui.main;
const St = imports.gi.St;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;

// Local Imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { debug, Settings } = Me.imports.utils;


const DeviceMenu = new Lang.Class({
    Name: "DeviceMenu",
    Extends: PopupMenu.PopupMenuSection,
    
    _init: function (device) {
        this.parent(null, "DeviceMenu");
        
        this.device = device;
        
        // Menu Items -> Separator
        this._item = new PopupMenu.PopupSeparatorMenuItem(this.device.name);
        // Menu Items -> Separator -> Battery label
        this.batteryLabel = new St.Label();
        this._item.actor.add(this.batteryLabel);
        // Menu Items -> Separator -> Battery Icon
        this.batteryIcon = new St.Icon({
            icon_name: "battery-missing-symbolic",
            style_class: "popup-menu-icon"
        });
        this._item.actor.add(this.batteryIcon);
        this._battery();
        this.addMenuItem(this._item);
        
        // Menu Items -> Action Bar
        this.actionBar = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });
        this.addMenuItem(this.actionBar);
        
        // Menu Items -> Action Bar -> Send SMS Action
        this.smsButton = this._createActionButton("user-available-symbolic");
        this.smsButton.connect("clicked", Lang.bind(this, this._sms));
        this.actionBar.actor.add(this.smsButton, { expand: true, x_fill: false });
        
        // Menu Items -> Action Bar -> Find my phone Action
        this.findButton = this._createActionButton("find-location-symbolic");
        this.findButton.connect("clicked", () => { this._findmyphone(); });
        this.actionBar.actor.add(this.findButton, { expand: true, x_fill: false });
        
        // Menu Items -> Action Bar -> Pair/Unpair Action
        this.trustButton = this._createActionButton("channel-insecure-symbolic");
        this.trustButton.connect("clicked", Lang.bind(this, this._trust));
        this.actionBar.actor.add(this.trustButton, { expand: true, x_fill: false });
        
        // Connect to "Device.changed::*" signals
        this.device.connect("changed::battery", Lang.bind(this, this._battery));
        this.device.connect("changed::plugins", Lang.bind(this, this._sync));
        
        this._sync();
    },
    
    _createActionButton: function (iconName) {
        let icon = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: "system-menu-action",
            style: "padding: 8px;"
        });
        
        icon.child = new St.Icon({ icon_name: iconName });
        
        return icon;
    },
    
    // Callbacks
    _battery: function (device, signal_id, level_state) {
        // Set the icon name, relevant to battery level and charging state
        debug("extension.DeviceMenu._battery(" + level_state + ")");
        
        // Battery plugin disabled
        if (!this.device.plugins.hasOwnProperty("battery") || !this.device.trusted) {
            this.batteryIcon.icon_name = "battery-missing-symbolic";
            this.batteryLabel.text = "";
            return;
        }
        
        // Try the get data from the device itself
        if (!level_state) {
            level_state = [
                this.device.plugins.battery.level,
                this.device.plugins.battery.charging
            ];
        }
        
        // These are the numbers and icons upower uses (except empty)
        let icon = "battery";
        
        if (level_state[0] < 3) {
            icon += level_state[1] === true ? "-empty-charging" : "-empty";
        } else if (level_state[0] < 10) {
            icon += level_state[1] === true ? "-caution-charging" : "-caution";
        } else if (level_state[0] < 30) {
            icon += level_state[1] === true ? "-low-charging" : "-low";
        } else if (level_state[0] < 60) {
            icon += level_state[1] === true ? "-good-charging" : "-good";
        } else if (level_state[0] >= 60) {
            icon += level_state[1] === true ? "-full-charging" : "-full";
        }
        
        this.batteryIcon.icon_name = icon + "-symbolic";
        this.batteryLabel.text = level_state[0] + "%";
    },
    
    // Action Callbacks
    _findmyphone: function (button, signal_id) {
        debug("extension.DeviceMenu._findmyphone()");
        
        this.device.plugins.findmyphone.find();
    },
    
    _sms: function (button, signal_id) {
        // TODO: track windows...
        debug("extension.DeviceMenu._sms()");
        
        GLib.spawn_command_line_async(
            Me.path + "/sms.js \"" + this.device.busPath + "\""
        );
    },
    
    _trust: function (button, signal_id) {
        debug("extension.DeviceMenu._trust()");
        
        this.emit("request::trusted", null, this.device.busPath);
    },
    
    _sync: function () {
        debug("extension.DeviceMenu._sync()");
        
        // SMS Button
        if (this.device.plugins.hasOwnProperty("telephony")) {
            this.smsButton.can_focus = true;
            this.smsButton.reactive = true;
            this.smsButton.track_hover = true;
            this.smsButton.opacity = 255;
        } else {
            this.smsButton.can_focus = false;
            this.smsButton.reactive = false;
            this.smsButton.track_hover = false;
            this.smsButton.opacity = 128;
        }
        
        // Find My Phone Button
        if (this.device.plugins.hasOwnProperty("findmyphone")) {
            this.findButton.can_focus = true;
            this.findButton.reactive = true;
            this.findButton.track_hover = true;
            this.findButton.opacity = 255;
        } else {
            this.findButton.can_focus = false;
            this.findButton.reactive = false;
            this.findButton.track_hover = false;
            this.findButton.opacity = 128;
        }
        
        // Pair Button
        if (this.device.trusted) {
            this.trustButton.child.icon_name = "channel-secure-symbolic";
        } else {
            this.trustButton.child.icon_name = "channel-insecure-symbolic";
        }
    }
});

Signals.addSignalMethods(DeviceMenu.prototype);

// A Re-Wrapper for backend.Device representing a device in Menu.panel.statusArea
// 
// PanelMenu.Button (Extends PanelMenu.ButtonBox)
//    -> St.Bin (this.container)
//        -> StBox (this.actor)
//    -> PopupMenu.PopupMenu (this.menu)
const DeviceIndicator = new Lang.Class({
    Name: "DeviceIndicator",
    Extends: PanelMenu.Button,
    
    _init: function (device) {
        this.parent(null, "DeviceIndicator");
        
        this.device = device;
        
        // Device Icon
        this.icon = new St.Icon({
            icon_name: "smartphone-disconnected",
            style_class: "system-status-icon"
        });
        this.actor.add_actor(this.icon);
        
        // Set icon
        this._status();
        
        let menu = new DeviceMenu(device);
        this.menu.addMenuItem(menu);
        
        // Signals
        this.device.connect("changed::active", Lang.bind(this, this._status));
        this.device.connect("changed::trusted", Lang.bind(this, this._status));
    },
    
    // Callbacks
    _status: function (device, signal_id, cb_data) {
        debug("extension.DeviceMenu._status(" + cb_data + ")");
        
        let icon = this.device.type;
        
        switch (true) {
            // Type correction for icons
            case (this.device.type == "phone"):
                icon = "smartphone";
            // Status
            case (this.device.active):
                this.icon.icon_name = icon + "-connected";
                break;
            case (this.device.trusted):
                this.icon.icon_name = icon + "-trusted";
                break;
//            case (this.device.paired):
//                this.icon.icon_name = icon + "-disconnected"
//                break;
            default:
                this.icon.icon_name = icon + "-disconnected";
        }
    }
});

// The main extension hub.
const SystemIndicator = new Lang.Class({
    Name: "SystemIndicator",
    Extends: PanelMenu.SystemIndicator,

    _init: function () {
        this.parent();
        
        this.manager = null;
        this._pauseSync = false;
        this.backend = Settings.get_boolean("use-kdeconnect") ? Me.imports.kdeconnect : Me.imports.mconnect;
        
        // device submenus
        this.deviceMenus = {};
        
        // Icon
        this.systemIndicator = this._addIndicator();
        this.systemIndicator.icon_name = "smartphone-symbolic";
        let userMenuTray = Main.panel.statusArea.aggregateMenu._indicators;
        userMenuTray.insert_child_at_index(this.indicators, 0);
        
        // Extension Menu
        this.mobileDevices = new PopupMenu.PopupSubMenuMenuItem("Mobile Devices", true);
        this.mobileDevices.icon.icon_name = "smartphone-symbolic";
        this.menu.addMenuItem(this.mobileDevices);
        
        // Extension Menu -> Devices Section -> [ DeviceMenu, ... ]
        this.devicesSection = new PopupMenu.PopupMenuSection();
        this.mobileDevices.menu.addMenuItem(this.devicesSection);
        
        // Extension Menu -> [ Enable Item ]
        this.enableItem = this.mobileDevices.menu.addAction(
            "Enable",
            this.backend.startDaemon
        );
        
        // Extension Menu -> Mobile Settings Item
        this.mobileDevices.menu.addAction(
            "Mobile Settings",
            this.backend.startSettings
        );
        
        //
        Main.panel.statusArea.aggregateMenu.menu.addMenuItem(this.menu, 4);
        
        // Signals
        Settings.connect("changed::per-device-indicators", Lang.bind(this, this._sync));
        Settings.connect("changed::show-inactive", Lang.bind(this, this._sync));
        Settings.connect("changed::show-unallowed", Lang.bind(this, this._sync));
        Settings.connect("changed::show-unpaired", Lang.bind(this, this._sync));
        
        // Watch for DBus service
        this._watchdog = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            this.backend.BUS_NAME,
            Gio.BusNameWatcherFlags.NONE,
            Lang.bind(this, this._daemonAppeared),
            Lang.bind(this, this._daemonVanished)
        );
        
        // Watch "start-daemon" setting
        Settings.connect(
            "changed::start-daemon",
            Lang.bind(
                this,
                function (settings, key, cb_data) {
                    debug("Settings: changed::start-daemon");
                    
                    if (Settings.get_boolean(key) && this.manager == null) {
                        this.backend.startDaemon();
                    }
                }
            )
        );
    },
    
    // UI Settings callbacks
    _isVisible: function (device) {
        // Return boolean whether user considers device visible or not
        // FIXME: not quite working
        debug("extension.SystemIndicator._isVisible(" + device.busPath + ")");
        
        let visible = [];
        
        switch (false) {
            case Settings.get_boolean("show-unpaired"):
                visible.push(device.paired);
            case Settings.get_boolean("show-unallowed"):
                visible.push(device.allowed);
            case Settings.get_boolean("show-inactive"):
                visible.push(device.paired);
        }
        
        return (visible.indexOf(false) < 0);
    },
    
    _sync: function () {
        debug("extension.SystemIndicator._sync()");
        
        if (this._pauseSync) {
            debug("extension.SystemIndicator._sync(): paused; skipping");
            return;
        }
        
        // Show "Enable" if backend not running
        this.enableItem.actor.visible = (this.manager) ? false : true;
        
        for (let busPath in this.deviceMenus) {
            if (Object.keys(this.deviceMenus).length < 1) {
                return;
            }
        
            let deviceIndicator = Main.panel.statusArea[busPath];
            let deviceMenu = this.deviceMenus[busPath];
            let visible = false;
            
            if (this.manager) {
                visible = this._isVisible(this.manager.devices[busPath])
            }
            
            // Show per-device indicators OR user menu entries
            if (Settings.get_boolean("per-device-indicators")) {
                deviceIndicator.actor.visible = visible;
                deviceMenu.actor.visible = false;
                this.systemIndicator.visible = (!this.manager);
            } else {
                this.systemIndicator.visible = true;
                deviceMenu.actor.visible = visible;
                deviceIndicator.actor.visible = false;
            }
        }
    },
    
    // DBus Callbacks
    _daemonAppeared: function (conn, name, name_owner, cb_data) {
        // The DBus interface has appeared
        debug("extension.SystemIndicator._daemonAppeared()");
        
        // Initialize the manager and add current devices
        this.manager = new this.backend.DeviceManager();
        
        for (let busPath in this.manager.devices) {
            systemIndicator._deviceAdded(this.manager, null, busPath);
        }
        
        // Sync the UI
        this._sync();
        
        // Watch for new and removed devices
        this.manager.connect(
            "device::added",
            Lang.bind(this, this._deviceAdded)
        );
        
        this.manager.connect(
            "device::removed",
            Lang.bind(this, this._deviceRemoved)
        );
    },
    
    _daemonVanished: function (conn, name, name_owner, cb_data) {
        // FIXME: some widgets missing on kdeconnectd shutdown?
        //        "JS ERROR: TypeError: deviceIndicator is undefined"
        // The DBus interface has vanished
        debug("extension.SystemIndicator._daemonVanished()");
        
        // Stop watching for new and remove devices
        // TODO: JS ERROR: Error: No signal connection device::added found
        //       JS ERROR: Error: No signal connection device::removed found
        //this.manager.disconnect("device::added");
        //this.manager.disconnect("device::removed");
        
        // If a manager is initialized, destroy it
        if (this.manager) {
            this._pauseSync = true;
            this.manager.destroy();
            delete this.manager;
            this._pauseSync = false;
        }
        
        // Sync the UI
        this._sync();
        
        // Start the daemon or wait for it to start
        if (Settings.get_boolean("start-daemon")) {
            this.backend.startDaemon();
        } else {
            log("waiting for daemon");
        }
    },
    
    _deviceAdded: function (manager, signal_id, busPath) {
        debug("extension.SystemIndicator._deviceAdded(" + busPath + ")");
        
        let device = manager.devices[busPath];
        
        // Per-device indicator
        let indicator = new DeviceIndicator(device);
        Main.panel.addToStatusArea(busPath, indicator);
        
        // User menu entry
        this.deviceMenus[busPath] = new DeviceMenu(device);
        this.deviceMenus[busPath].connect(
            "request::trusted",
            (menu, signal_id, devPath) => {
                debug("TRUE");
                if (this.manager.devices[devPath].trusted) {
                    debug("request unpairing");
                } else {
                    debug("request pairing");
                }
            }
        );
        this.devicesSection.addMenuItem(this.deviceMenus[busPath]);
        
        this._sync();
    },
    
    _deviceRemoved: function (manager, signal_id, busPath) {
        debug("extension.SystemIndicator._deviceRemoved(" + busPath + ")");
        
        // Per-device indicator
        Main.panel.statusArea[busPath].destroy();
        
        // User menu entry
        this.deviceMenus[busPath].destroy();
        
        this._sync();
    },
    
    // Public Methods
    destroy: function () {
        this._pauseSync = true;
        this.manager.destroy();
        delete this.manager;
        
        // Destroy the UI
        this.devicesSection.destroy();
        this.mobileDevices.destroy();
        this.systemIndicator.destroy();
        this.menu.destroy();
    
        // Stop watching "start-daemon" & DBus
        Settings.disconnect("changed::start-daemon");
        
        // Stop watching for DBus Service
        Gio.bus_unwatch_name(this._watchdog);
    }
});


var systemIndicator; // FIXME: not supposed to mix "let" and "var"

function init() {
    debug("initializing extension");
    
    // TODO: localization
};
 
function enable() {
    debug("enabling extension");
    
    // Create the UI
    systemIndicator = new SystemIndicator();
    
    Settings.connect(
        "changed::use-kdeconnect",
        function (settings, key, cb_data) {
            debug("Settings: changed::use-kdeconnect");
            
            systemIndicator.destroy();
            systemIndicator = new SystemIndicator();
        }
    );
};
 
function disable() {
    debug("disabling extension");
    
    // Destroy the UI
    systemIndicator.destroy();
};



