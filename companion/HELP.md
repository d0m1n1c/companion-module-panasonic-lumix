# Panasonic Lumix

This module controls Panasonic Lumix Wi-Fi-enabled cameras, including the S5II and S5IIX access/session flow.

## Setup

1. Connect the camera and Companion computer to the same network.
2. Put the camera into its Wi-Fi remote-control mode.
3. Enter the camera IP address in the connection configuration.
4. Approve the controller on the camera if prompted.

The module reads the camera identity from port 60606, requests access, stores the returned session ID, and includes it in subsequent commands. The session ID is not written to the log.

## Actions

- Video Record Start
- Video Record Stop

Recording feedback changes after the camera accepts an action. A lightweight setting request is sent every second by default to keep the S5II/S5IIX session alive without blocking controls on cameras where `getstate` does not return reliably.

## Variables

- Recording State
- Camera Model

## Feedbacks

- Recording State
