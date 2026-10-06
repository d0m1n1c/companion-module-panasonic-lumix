const { InstanceBase, InstanceStatus, Regex } = require('@companion-module/base')
const { LumixCameraClient, parseRecordingState } = require('./camera-client')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')
const UpgradeScripts = require('./upgrades')

class LumixInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.camera = null
		this.pollTimer = null
		this.reconnectTimer = null
		this.pollInFlight = false
		this.consecutivePollErrors = 0
		this.data = {
			recordingState: false,
			cameraInfo: null,
		}
	}

	async init(config) {
		this.config = this.normalizeConfig(config)
		this.updateDefinitions()
		this.createCameraClient()
		this.connectCamera()
	}

	async destroy() {
		this.stopPolling()
		if (this.camera) this.camera.disconnect()
		this.log('debug', 'Lumix module destroyed')
	}

	async configUpdated(config) {
		this.stopPolling()
		if (this.camera) this.camera.disconnect()
		this.config = this.normalizeConfig(config)
		this.createCameraClient()
		this.connectCamera()
	}

	normalizeConfig(config) {
		return {
			host: (config && config.host) || '',
			interval: config && config.interval !== undefined ? Number(config.interval) : 1000,
			controllerName: (config && config.controllerName) || 'Bitfocus Companion',
			debug: Boolean(config && config.debug),
		}
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'Controls Panasonic Lumix cameras over Wi-Fi, including the S5II and S5IIX session handshake.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Camera IP',
				width: 6,
				regex: Regex.IP,
			},
			{
				type: 'textinput',
				id: 'controllerName',
				label: 'Controller Name',
				width: 6,
				default: 'Bitfocus Companion',
			},
			{
				type: 'number',
				id: 'interval',
				label: 'State Poll Interval (ms)',
				width: 6,
				default: 1000,
				min: 0,
				max: 60000,
			},
			{
				type: 'checkbox',
				id: 'debug',
				label: 'Enable Debug Logging',
				width: 6,
				default: false,
			},
		]
	}

	updateDefinitions() {
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdateVariableDefinitions(this)
		this.setVariableValues({
			recording_state: this.data.recordingState ? 'Recording' : 'Stopped',
			camera_model: this.data.cameraInfo ? this.data.cameraInfo.modelName || '' : '',
		})
	}

	createCameraClient() {
		this.camera = new LumixCameraClient({
			host: this.config.host,
			controllerName: this.config.controllerName,
		})
	}

	async connectCamera() {
		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Camera IP is required')
			return
		}

		const camera = this.camera
		try {
			this.updateStatus(InstanceStatus.Connecting, 'Requesting camera access')
			const cameraInfo = await camera.connect()
			if (camera !== this.camera) return
			this.data.cameraInfo = cameraInfo
			this.setVariableValues({ camera_model: cameraInfo.modelName || '' })
			this.updateStatus(InstanceStatus.Ok)
			this.log('info', 'Connected to ' + (cameraInfo.modelName || 'Lumix camera'))
			await this.pollCameraState()
			if (camera === this.camera) this.startPolling()
		} catch (error) {
			if (camera !== this.camera) return
			this.updateStatus(InstanceStatus.ConnectionFailure, error.message)
			this.log('error', 'Unable to connect to camera: ' + error.message)
			this.scheduleReconnect()
		}
	}

	scheduleReconnect() {
		if (this.reconnectTimer || !this.config.host || this.config.interval <= 0) return
		const retryDelay = Math.max(5000, this.config.interval)
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			this.connectCamera()
		}, retryDelay)
	}

	startPolling() {
		this.stopPolling()
		if (this.config.interval > 0) {
			this.pollTimer = setInterval(() => this.pollCameraState(), Math.max(1000, this.config.interval))
		}
	}

	stopPolling() {
		if (this.pollTimer) clearInterval(this.pollTimer)
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
		this.pollTimer = null
		this.reconnectTimer = null
	}

	async pollCameraState() {
		if (!this.camera || !this.config.host || this.pollInFlight) return
		this.pollInFlight = true
		const camera = this.camera
		try {
			const stateXml = await camera.getState()
			if (camera !== this.camera) return
			const recordingState = parseRecordingState(stateXml)
			if (recordingState !== null) this.setRecordingState(recordingState)
			this.consecutivePollErrors = 0
			this.updateStatus(InstanceStatus.Ok)
		} catch (error) {
			if (camera === this.camera) {
				this.consecutivePollErrors += 1
				this.updateStatus(InstanceStatus.Ok, 'Connected; state polling unavailable')
				if (this.consecutivePollErrors === 1) {
					this.log('warn', 'Camera state polling unavailable; control commands will continue: ' + error.message)
				} else if (this.config.debug) {
					this.log('debug', 'Camera state poll failed: ' + error.message)
				}
			}
		} finally {
			this.pollInFlight = false
		}
	}

	async sendCommand(command) {
		if (!this.camera) throw new Error('Camera client is not initialized')
		if (this.config.debug) this.log('debug', 'Send CMD: ' + command)
		try {
			const response = await this.camera.command(command)
			this.consecutivePollErrors = 0
			this.updateStatus(InstanceStatus.Ok)
			return response
		} catch (error) {
			this.updateStatus(InstanceStatus.ConnectionFailure, error.message)
			this.log('error', 'Camera command failed: ' + error.message)
			throw error
		}
	}

	setRecordingState(recordingState) {
		if (this.data.recordingState === recordingState) return
		this.data.recordingState = recordingState
		this.setVariableValues({ recording_state: recordingState ? 'Recording' : 'Stopped' })
		this.checkFeedbacks('recordingState')
	}
}

module.exports = LumixInstance
module.exports.UpgradeScripts = UpgradeScripts
