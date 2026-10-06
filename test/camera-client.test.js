const assert = require('node:assert/strict')
const test = require('node:test')
const { LumixCameraClient, cameraResult, parseRecordingState } = require('../src/camera-client')
const actions = require('../src/actions')

test('parses camera replies and recording state', function () {
	assert.equal(cameraResult('<camrply><result>ok</result></camrply>'), 'ok')
	assert.equal(parseRecordingState('<camrply><state><rec>on</rec></state></camrply>'), true)
	assert.equal(parseRecordingState('<camrply><state><video_rec>off</video_rec></state></camrply>'), false)
	assert.equal(parseRecordingState('<camrply><state><cammode>rec</cammode></state></camrply>'), null)
})

test('record actions use their instance and only update state after command success', async function () {
	const commands = []
	const states = []
	const instance = {
		setActionDefinitions: function (value) {
			this.actionDefinitions = value
		},
		sendCommand: async function (command) {
			commands.push(command)
		},
		setRecordingState: function (state) {
			states.push(state)
		},
	}
	actions(instance)
	const definitions = instance.actionDefinitions

	await definitions.recordingStart.callback()
	await definitions.recordingStop.callback()

	assert.deepEqual(commands, [
		'mode=camcmd&value=recmode',
		'mode=camcmd&value=video_recstart',
		'mode=camcmd&value=video_recstop',
	])
	assert.deepEqual(states, [true, false])
})

test('connects, sends the session header, and retries an expired session', async function (t) {
	const requests = []
	let sessionNumber = 0
	let rejectCommandOnce = true
	const client = new LumixCameraClient({ host: '127.0.0.1', accessRetryDelay: 1 })
	client._request = async function (_port, path, headers) {
		headers = headers || {}
		requests.push({ url: path, session: headers['X-SESSION_ID'] })
		if (path === '/Lumix/Server0/ddd') {
			return {
				statusCode: 200,
				body: '<root><device><friendlyName>DC-S5M2X</friendlyName><modelName>DC-S5M2X</modelName><UDN>uuid:camera-123</UDN><pana:X_FirmVersion>2.0</pana:X_FirmVersion></device></root>',
			}
		}
		if (path.indexOf('type=req_acc_g') !== -1) return { statusCode: 200, body: 'ok' }
		if (path.indexOf('type=req_acc_e') !== -1) {
			sessionNumber += 1
			return { statusCode: 200, body: 'ok,camera-name,session-' + sessionNumber }
		}
		if (path.indexOf('type=device_name') !== -1)
			return { statusCode: 200, body: '<camrply><result>ok</result></camrply>' }
		if (path.indexOf('video_recstart') !== -1 && rejectCommandOnce) {
			rejectCommandOnce = false
			return { statusCode: 200, body: '<camrply><result>err_session</result></camrply>' }
		}
		return { statusCode: 200, body: '<camrply><result>ok</result><state><rec>on</rec></state></camrply>' }
	}

	await client.connect()
	assert.equal(client.sessionId, 'session-1')
	await client.command('mode=camcmd&value=video_recstart')
	assert.equal(client.sessionId, 'session-2')

	const commandRequests = requests.filter(function (item) {
		return item.url.indexOf('video_recstart') !== -1
	})
	assert.deepEqual(
		commandRequests.map(function (item) {
			return item.session
		}),
		['session-1', 'session-2'],
	)
	assert.ok(
		requests.some(function (item) {
			return item.url.indexOf('value=63616d6572612d313233') !== -1
		}),
	)
})
