const http = require('http')

function delay(ms) {
	return new Promise(function (resolve) {
		setTimeout(resolve, ms)
	})
}

function tagValue(xml, tag) {
	const expression = new RegExp(
		'<(?:[A-Za-z0-9_-]+:)?' + tag + '(?:\\s[^>]*)?>([^<]*)</(?:[A-Za-z0-9_-]+:)?' + tag + '>',
		'i',
	)
	const match = expression.exec(xml || '')
	return match ? match[1].trim() : ''
}

function cameraResult(xml) {
	return tagValue(xml, 'result')
}

function parseRecordingState(xml) {
	const tags = ['rec', 'recording', 'recording_state', 'video_rec', 'video_recording', 'movie_rec']

	for (let index = 0; index < tags.length; index++) {
		const value = tagValue(xml, tags[index]).toLowerCase()
		if (!value) continue
		if (['on', 'start', 'started', 'recording', 'rec', '1', 'true'].indexOf(value) !== -1) return true
		if (['off', 'stop', 'stopped', 'standby', '0', 'false'].indexOf(value) !== -1) return false
	}

	return null
}

class LumixCameraClient {
	constructor(options) {
		options = options || {}
		this.host = options.host || ''
		this.controllerName = options.controllerName || 'Bitfocus Companion'
		this.timeout = options.timeout || 5000
		this.accessAttempts = options.accessAttempts || 20
		this.accessRetryDelay = options.accessRetryDelay || 500
		this.log = options.log || function () {}
		this.sessionId = ''
		this.deviceInfo = null
		this._connecting = null
	}

	setHost(host) {
		if (this.host !== host) {
			this.host = host || ''
			this.sessionId = ''
			this.deviceInfo = null
		}
	}

	_request(port, path, headers) {
		const self = this
		return new Promise(function (resolve, reject) {
			if (!self.host) {
				reject(new Error('Camera IP is not configured'))
				return
			}

			const request = http.get(
				{
					host: self.host,
					port: port,
					path: path,
					headers: headers || {},
					timeout: self.timeout,
				},
				function (response) {
					let body = ''
					response.setEncoding('utf8')
					response.on('data', function (chunk) {
						body += chunk
					})
					response.on('end', function () {
						resolve({ statusCode: response.statusCode, body: body, headers: response.headers })
					})
				},
			)

			request.on('timeout', function () {
				request.destroy(new Error('Camera request timed out'))
			})
			request.on('error', reject)
		})
	}

	_assertHttpOk(response, description) {
		if (!response || response.statusCode < 200 || response.statusCode >= 300) {
			throw new Error(description + ' failed with HTTP ' + (response ? response.statusCode : 'unknown'))
		}
	}

	_camRequest(query, includeSession) {
		const headers = {}
		if (includeSession && this.sessionId) headers['X-SESSION_ID'] = this.sessionId
		return this._request(80, '/cam.cgi?' + query, headers)
	}

	async connect() {
		if (this._connecting) return this._connecting

		const self = this
		this._connecting = (async function () {
			self.sessionId = ''

			const description = await self._request(60606, '/Lumix/Server0/ddd')
			self._assertHttpOk(description, 'Camera discovery')

			const rawUdn = tagValue(description.body, 'UDN')
			if (!rawUdn) throw new Error('Camera discovery response did not contain a UDN')
			const udn = rawUdn.replace(/^uuid:/i, '')
			self.deviceInfo = {
				friendlyName: tagValue(description.body, 'friendlyName'),
				manufacturer: tagValue(description.body, 'manufacturer'),
				modelName: tagValue(description.body, 'modelName'),
				modelNumber: tagValue(description.body, 'modelNumber'),
				serialNumber: tagValue(description.body, 'serialNumber'),
				udn: udn,
				firmwareVersion: tagValue(description.body, 'X_FirmVersion'),
			}

			const accessStart = await self._camRequest('mode=accctrl&type=req_acc_g', false)
			self._assertHttpOk(accessStart, 'Camera access request')

			const encodedUdn = Buffer.from(udn, 'utf8').toString('hex')
			const encodedName = Buffer.from(self.controllerName, 'utf8').toString('hex')
			let lastResponse = ''

			for (let attempt = 0; attempt < self.accessAttempts; attempt++) {
				const access = await self._camRequest(
					'mode=accctrl&type=req_acc_e&value=' +
						encodeURIComponent(encodedUdn) +
						'&value2=' +
						encodeURIComponent(encodedName),
					false,
				)
				self._assertHttpOk(access, 'Camera access confirmation')
				lastResponse = access.body.trim()
				const values = lastResponse.split(',').map(function (value) {
					return value.trim()
				})
				if (values[0].toLowerCase() === 'ok') {
					self.sessionId = values[values.length - 1]
					break
				}
				await delay(self.accessRetryDelay)
			}

			if (!self.sessionId) {
				throw new Error('Camera did not grant access' + (lastResponse ? ': ' + lastResponse : ''))
			}

			const setName = await self._camRequest(
				'mode=setsetting&type=device_name&value=' + encodeURIComponent(self.controllerName),
				true,
			)
			self._assertHttpOk(setName, 'Controller name confirmation')
			if (cameraResult(setName.body) !== 'ok') {
				throw new Error('Camera rejected controller name: ' + (cameraResult(setName.body) || setName.body))
			}

			return self.deviceInfo
		})()

		try {
			return await this._connecting
		} finally {
			this._connecting = null
		}
	}

	async command(query, retryAccess) {
		if (retryAccess === undefined) retryAccess = true
		if (!this.sessionId) await this.connect()

		const response = await this._camRequest(query, true)
		this._assertHttpOk(response, 'Camera command')
		const result = cameraResult(response.body)

		if (retryAccess && (result === 'err_reject' || result === 'err_session')) {
			this.sessionId = ''
			await this.connect()
			return this.command(query, false)
		}

		if (result && result !== 'ok') throw new Error('Camera returned ' + result)
		if (!result) throw new Error('Camera returned an invalid response')
		return response.body
	}

	getState() {
		return this.command('mode=getstate')
	}

	disconnect() {
		this.sessionId = ''
		this.deviceInfo = null
	}
}

module.exports = {
	LumixCameraClient: LumixCameraClient,
	cameraResult: cameraResult,
	parseRecordingState: parseRecordingState,
	tagValue: tagValue,
}
