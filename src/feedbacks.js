const { combineRgb } = require('@companion-module/base')

module.exports = function UpdateFeedbacks(self) {
	self.setFeedbackDefinitions({
		recordingState: {
			type: 'boolean',
			name: 'Recording State',
			description: 'Indicate whether the camera is recording or stopped',
			defaultStyle: {
				color: combineRgb(255, 255, 255),
				bgcolor: combineRgb(255, 0, 0),
			},
			options: [
				{
					type: 'dropdown',
					label: 'State',
					id: 'state',
					default: 'recording',
					choices: [
						{ id: 'stopped', label: 'Stopped' },
						{ id: 'recording', label: 'Recording' },
					],
				},
			],
			callback: function (feedback) {
				return feedback.options.state === 'recording' ? self.data.recordingState : !self.data.recordingState
			},
		},
	})
}
