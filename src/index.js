var instance_skel = require('../../../instance_skel')
var actions = require('./actions.js')
var presets = require('./presets.js')
var feedbacks = require('./feedbacks.js')
var variables = require('./variables.js')
var cameraClient = require('./camera-client.js')

var debug

instance.prototype.INTERVAL = null; //used for polling device
instance.prototype.camera = null;
instance.prototype.pollInFlight = false;

// ########################
// #### Instance setup ####
// ########################
function instance(system, id, config) {
	let self = this;

	// super-constructor
	instance_skel.apply(this, arguments)

	return self
}

instance.GetUpgradeScripts = function () {
}

// When module gets deleted
instance.prototype.destroy = function () {
	let self = this;

	if (self.INTERVAL) {
		clearInterval(self.INTERVAL);
		self.INTERVAL = null;
	}
	if (self.camera) self.camera.disconnect()

	debug('destroy', self.id)
}

// Initalize module
instance.prototype.init = function () {
	let self = this;

	debug = self.debug
	log = self.log

	self.data = {
		recordingState: false,
		cameraInfo: null
	}

	self.config.host = this.config.host || ''
	self.config.debug = this.config.debug || false
	self.config.interval = this.config.interval === undefined ? 1000 : Number(this.config.interval)
	self.config.controllerName = this.config.controllerName || 'Bitfocus Companion'

	self.status(self.STATUS_WARNING, 'connecting')
	self.createCameraClient()
	self.connectCamera()
	self.actions() // export actions
	self.init_presets()
	self.init_variables()
	self.checkVariables()
	self.init_feedbacks()
	self.checkFeedbacks()
}

// Update module after a config change
instance.prototype.updateConfig = function (config) {
	let self = this;
	self.config = config
	self.status(self.STATUS_UNKNOWN)
	self.config.interval = self.config.interval === undefined ? 1000 : Number(self.config.interval)
	self.config.controllerName = self.config.controllerName || 'Bitfocus Companion'
	self.createCameraClient()
	self.connectCamera()
	self.actions() // export actions
	self.init_presets()
	self.init_variables()
	self.checkVariables()
	self.init_feedbacks()
	self.checkFeedbacks()
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	let self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module controls Panasonic Lumix Wifi-Enabled Cameras.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Camera IP',
			width: 4,
			regex: self.REGEX_IP
		},
		{
			type: 'text',
			id: 'dummy1',
			width: 12,
			label: ' ',
			value: ' ',
		},
		{
			type: 'text',
			id: 'intervalInfo',
			width: 12,
			label: 'Update Interval',
			value: 'Please enter the amount of time in milliseconds to request new information from the camera. Set to 0 to disable.',
		},
		{
			type: 'textinput',
			id: 'interval',
			label: 'Update Interval',
			width: 3,
			default: 1000
		},
		{
			type: 'textinput',
			id: 'controllerName',
			label: 'Controller Name',
			width: 4,
			default: 'Bitfocus Companion'
		},
		{
			type: 'text',
			id: 'dummy2',
			width: 12,
			label: ' ',
			value: ' ',
		},
		{
			type: 'text',
			id: 'Info',
			width: 12,
			label: 'Other Settings',
			value:
				'These setting can be left on the default values and should give you a consistent setup, but they are there for you to use if need be.',
		},
		{
			type: 'checkbox',
			id: 'debug',
			width: 1,
			label: 'Enable',
			default: false,
		},
		{
			type: 'text',
			id: 'debugInfo',
			width: 11,
			label: 'Enable Debug To Log Window',
			value:
				'Requires Companion to be restarted. But this will allow you the see what is being sent from the module and what is being received from the camera.',
		},
	]
}


instance.prototype.createCameraClient = function () {
	let self = this
	if (self.camera) self.camera.disconnect()
	self.camera = new cameraClient.LumixCameraClient({
		host: self.config.host,
		controllerName: self.config.controllerName,
		log: function (message) { self.log('debug', message) },
	})
}

instance.prototype.connectCamera = async function () {
	let self = this
	if (!self.config.host) {
		self.status(self.STATUS_WARNING, 'Camera IP is required')
		return
	}

	try {
		self.status(self.STATUS_WARNING, 'Requesting camera access')
		self.data.cameraInfo = await self.camera.connect()
		self.status(self.STATUS_OK)
		self.log('info', 'Connected to ' + (self.data.cameraInfo.modelName || 'Lumix camera'))
		await self.getCameraInformation()
	} catch (error) {
		self.status(self.STATUS_ERROR, error.message)
		self.log('error', 'Unable to connect to camera: ' + error.message)
	} finally {
		self.setupInterval()
	}
}

instance.prototype.getCameraInformation = async function () {
	let self = this
	if (!self.camera || !self.config.host || self.pollInFlight) return

	self.pollInFlight = true
	try {
		const stateXml = await self.camera.getState()
		const recordingState = cameraClient.parseRecordingState(stateXml)
		if (recordingState !== null) self.setRecordingState(recordingState)
		self.status(self.STATUS_OK)
	} catch (error) {
		self.status(self.STATUS_ERROR, error.message)
		self.log('error', 'Camera state poll failed: ' + error.message)
	} finally {
		self.pollInFlight = false
	}
};

instance.prototype.getCameraInformation_Delayed = function() {
	let self = this;

	setTimeout(self.getCameraInformation.bind(self), 500);
};

instance.prototype.storeData = function (str) {
	let self = this;

	self.data.info.push(str);

	try {
		// Store Values from Response
	}
	catch(error) {
		self.log('error', 'Error parsing response from Camera: ' + String(error))
	}
};

instance.prototype.setupInterval = function() {
	let self = this;

	if (self.INTERVAL !== null) {
		clearInterval(self.INTERVAL);
		self.INTERVAL = null;
	}

	const configuredInterval = Number(self.config.interval)
	if (configuredInterval > 0) {
		self.INTERVAL = setInterval(self.getCameraInformation.bind(self), Math.max(1000, configuredInterval));
	}
};

// ##########################
// #### Instance Presets ####
// ##########################
instance.prototype.init_presets = function () {
	this.setPresetDefinitions(presets.setPresets(this));
}

// ############################
// #### Instance Variables ####
// ############################
instance.prototype.init_variables = function () {
	this.setVariableDefinitions(variables.setVariables(this));
}

// Setup Initial Values
instance.prototype.checkVariables = function () {
	variables.checkVariables(this);
}

// ############################
// #### Instance Feedbacks ####
// ############################
instance.prototype.init_feedbacks = function (system) {
	this.setFeedbackDefinitions(feedbacks.setFeedbacks(this));
}

// ##########################
// #### Instance Actions ####
// ##########################
instance.prototype.sendCommand = function (str) {
	let self = this
	if (str === undefined) return Promise.reject(new Error('No camera command was supplied'))
	if (!self.camera) return Promise.reject(new Error('Camera client is not initialized'))

	if (self.config.debug === true) self.log('debug', 'Send CMD: ' + String(str))
	return self.camera.command(str).catch(function (error) {
		self.status(self.STATUS_ERROR, error.message)
		self.log('error', 'Camera command failed: ' + error.message)
		throw error
	})
}

instance.prototype.setRecordingState = function (recordingState) {
	let self = this
	if (self.data.recordingState === recordingState) return
	self.data.recordingState = recordingState
	self.checkVariables()
	self.checkFeedbacks('recordingState')
}

instance.prototype.actions = function (system) {
	this.setActions(actions.setActions(this));
}

instance_skel.extendedBy(instance);
exports = module.exports = instance;
