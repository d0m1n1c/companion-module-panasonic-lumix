Panasonic Lumix

## This module supports Panasonic Lumix wifi-enabled cameras.

The S5II/S5IIX must already be connected to the same network as Companion and be waiting for a controller connection. Configure the camera IP in the module. The module reads the camera identity from port 60606, requests access, stores the returned session ID, and includes that session in subsequent commands.

The camera may display a connection approval prompt the first time a controller name is used. The default controller name is `Bitfocus Companion` and can be changed in the module configuration.

## Actions

- Video Record Start/Stop

Record Start/Stop only changes the Companion recording feedback after the camera returns an `ok` response. A state request is also sent every second by default to keep the S5II/S5IIX session alive and consume recording state when the camera exposes it.

## Variables
- Video Recording State

## Feedbacks

- Video is Recording/Stopped
