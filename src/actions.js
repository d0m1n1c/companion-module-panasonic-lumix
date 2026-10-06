module.exports = {
	// ##########################
	// #### Instance Actions ####
	// ##########################
	setActions: function (i) {
		let self = i
		let actions = {}
		let cmd = ''

		actions.recordingStart = {
			label: 'Video Record Start',
			callback: function (action, bank) {
				cmd = 'mode=camcmd&value=video_recstart'
				return self.sendCommand(cmd).then(function () {
					self.setRecordingState(true)
				})
			}
		}

		actions.recordingStop = {
			label: 'Video Record Stop',
			callback: function (action, bank) {
				cmd = 'mode=camcmd&value=video_recstop'
				return self.sendCommand(cmd).then(function () {
					self.setRecordingState(false)
				})
			}
		}

		return actions
	}
}
