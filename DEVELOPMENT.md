# S5II/S5IIX development notes

## Current milestone

This branch keeps the original Companion 1.x module shape and makes the existing Video Record Start/Stop actions usable with the S5II/S5IIX access-controlled HTTP API.

Connection flow:

1. Read `/Lumix/Server0/ddd` on port 60606 and extract the camera UDN and model information.
2. Send `mode=accctrl&type=req_acc_g` to `cam.cgi` on port 80.
3. Retry `mode=accctrl&type=req_acc_e` with the hex-encoded UDN and controller name while the camera asks the user to approve access.
4. Store the session ID from the comma-separated `ok` response.
5. Include `X-SESSION_ID` on every state and command request.
6. Send `mode=getstate` once per second by default to keep the session alive.

If a command returns `err_reject` or `err_session`, the client performs the access flow again and retries that command once.

## Reference comparison

- `njfdev/liblumix` is the primary S5IIX-tested reference for device discovery, the two-stage `req_acc_g` / `req_acc_e` access flow, hex encoding, `X-SESSION_ID`, and the one-second `getstate` heartbeat.
- `totoantibes/LumixCameraAscomDriver` confirms the long-lived `getstate` polling pattern and useful `cam.cgi` commands for later milestones. Its current Wi-Fi path uses the older access model and does not provide the S5IIX session-header behavior, so that part was not copied.
- The original Companion module's `camcmd&value=video_recstart` and `video_recstop` request form is preserved.

## Local camera test

1. Put the S5II/S5IIX into its Wi-Fi remote-control mode and connect the Companion computer to the same network.
2. Load this directory as the development copy of `panasonic-lumix` using the same local-module method used for the original module.
3. Set **Camera IP** and leave the update interval at 1000 ms for the first test.
4. Approve the controller on the camera if it prompts.
5. Confirm the Companion log changes from `Requesting camera access` to `Connected to ...`.
6. Press **Video Record Start**, verify recording begins on the camera, then press **Video Record Stop**.

Enable module debug logging to see commands. The session ID is deliberately not logged.

Run the offline protocol tests with:

```sh
npm test
```

The next milestone is to capture a real S5II/S5IIX `getstate` response while stopped and while recording. That will let the feedback parser use the camera's exact recording-state field rather than relying on the successful action result when the model does not expose one of the known state tags.
