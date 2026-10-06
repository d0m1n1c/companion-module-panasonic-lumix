module.exports = function UpdateActions(self) {
	self.setActionDefinitions({
		recordingStart: {
			name: 'Video Record Start',
			options: [],
			callback: async function () {
				await self.sendCommand('mode=camcmd&value=video_recstart')
				self.setRecordingState(true)
			},
		},
		recordingStop: {
			name: 'Video Record Stop',
			options: [],
			callback: async function () {
				await self.sendCommand('mode=camcmd&value=video_recstop')
				self.setRecordingState(false)
			},
		},
	})
}
