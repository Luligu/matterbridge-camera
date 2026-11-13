# <img src="https://matterbridge.io/assets/matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge camera plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-camera.svg)](https://www.npmjs.com/package/matterbridge-camera)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-camera.svg)](https://www.npmjs.com/package/matterbridge-camera)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge/latest?label=docker%20version)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Luligu/b21088ab9c9f2b119b42c33f0fef218d/raw/docker.json)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-camera/actions/workflows/build.yml/badge.svg)
![CodeQL](https://github.com/Luligu/matterbridge-camera/actions/workflows/codeql.yml/badge.svg)
[![codecov](https://codecov.io/gh/Luligu/matterbridge-camera/branch/main/graph/badge.svg)](https://codecov.io/gh/Luligu/matterbridge-camera)
[![tested with Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18.svg?logo=vitest&logoColor=white)](https://vitest.dev)
[![styled with Oxc](https://img.shields.io/badge/styled_with-Oxc-9BE4E0.svg?logo=oxc&logoColor=white)](https://oxc.rs/docs/guide/usage/formatter.html)
[![linted with Oxc](https://img.shields.io/badge/linted_with-Oxc-9BE4E0.svg?logo=oxc&logoColor=white)](https://oxc.rs/docs/guide/usage/linter.html)
[![TypeScript Native](https://img.shields.io/badge/TypeScript_Native-3178C6?logo=typescript&logoColor=white)](https://github.com/microsoft/typescript-go)
[![ESM](https://img.shields.io/badge/ESM-Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![matterbridge.io](https://img.shields.io/badge/matterbridge.io-online-brightgreen)](https://matterbridge.io)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-matter--history-blue)](https://www.npmjs.com/package/matter-history)
[![powered by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![powered by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

This plugin is for network cameras that provide an RTSP stream. It exposes manually configured RTSP cameras as Matter cameras. For local cameras connected to the Matterbridge host, such as USB webcams and built-in cameras, use [matterbridge-webcam](https://github.com/Luligu/matterbridge-webcam).

Requires Matterbridge 3.11.0 or newer and ffmpeg.

Features:

- The cameras are configured manually in the plugin config: each camera has a name, an RTSP video URL, an optional audio URL, a resolution and a bitrate.
- Each camera can be previewed in an ffplay window with the Play button in the frontend (not available in docker).
- In docker, ffmpeg can be installed automatically at start if it is not found.

## Before you start

- A Matter controller that supports cameras (Matter 1.5 or newer). At the moment these are SmartThings and the [Open Home Foundation Matter Server](https://github.com/matter-js/matterjs-server) dashboard (Home Assistant does not show Matter cameras yet). Apple Home, Google Home and Alexa have announced camera support but not released it. A controller without camera support does not show the camera.
- A camera with RTSP enabled. Many cameras have RTSP turned off by default: enable it in the camera's app or web page.
- ffmpeg on the Matterbridge host (see [ffmpeg](#ffmpeg) below).

## Installation

In the Matterbridge frontend, type `matterbridge-camera` in the **Install plugins** box, press **Install** and restart Matterbridge when asked.

## Quick start

1. Find the RTSP URL of your camera (see [How to find the RTSP URL](#how-to-find-the-rtsp-url)).
2. Open the plugin configuration, add a camera in **Cameras**, give it a name and paste the URL in the video source.
3. Press **Play** to check the video (on a host with a desktop), then save and restart the plugin.
4. The camera appears in your Matter controller.

## How to find the RTSP URL

The RTSP URL looks like `rtsp://user:password@192.168.1.100:554/stream`. The path after the port depends on the brand and model:

- Look in the camera's manual, app or web page, usually under RTSP, ONVIF or streaming.
- Search the web for `<brand> <model> RTSP URL`.
- Many cameras have a main stream (high resolution) and a sub stream (lower resolution): the sub stream uses less CPU.

Test the URL with **Play** or with [VLC](https://www.videolan.org/) (Media > Open Network Stream) before you add it.

If the password contains special characters such as `@`, `:`, `/`, `#` or `?`, write them [URL-encoded](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding): for example `@` becomes `%40` and `#` becomes `%23`.

## Configuration

Add and remove entries in **Cameras** in the plugin configuration, then save and restart the plugin. No discovery is performed. Keep camera names stable: each name determines its Matter identity.

Missing resolution and bitrate values are initialized to `auto` and `1000` when the plugin loads. Existing values are preserved.

Each camera has these options:

- `videoSource`: required RTSP video URL, such as `rtsp://user:password@host:554/path`.
- `audioSource`: optional RTSP audio URL; use the video URL for audio from the same stream, or leave empty for no audio.
- `videoResolution`: `auto` (default, follows the controller request), `640x480`, `1280x720`, or `1920x1080`.
- `videoBitrate`: positive target encoder bitrate in kbps, default `1000`. Suggested values are 800 for VGA, 2000 for 720p, and 2500 for 1080p.
- **Play**: preview the video URL in a local ffplay window. Requires a graphical desktop and ffplay on PATH. Preview audio comes from the video URL when audio is enabled; the separate audio URL and encoder settings apply to Matter streaming.

```json
{
  "cameras": {
    "Front Door": {
      "videoSource": "rtsp://user:password@192.168.1.100:554/stream",
      "audioSource": "",
      "videoResolution": "1280x720",
      "videoBitrate": 2000
    }
  }
}
```

## ffmpeg

In Docker, enable the `autoInstallFfmpeg` option (enabled by default) and the plugin installs ffmpeg at start with `apk` or `apt-get` if it is not found. If you use more than one ffmpeg plugin (camera, webcam), enable it on only one of them: concurrent installs fail on the package manager lock.

The **Install ffmpeg (Linux only)** button installs ffmpeg on demand, including outside Docker. Matterbridge must run as root on Linux with `apk` (Alpine) or `apt-get` (Debian/Ubuntu). The frontend reports the result; if ffmpeg is already installed, no installation is performed. On macOS and Windows, install ffmpeg manually.

#### Linux (Debian/Ubuntu)

```bash
sudo apt update && sudo apt install -y ffmpeg
```

#### macOS

```bash
brew install ffmpeg
```

#### Windows

```powershell
winget install --id Gyan.FFmpeg -e
```

## WebRTC streaming in Docker

If the picture is black and Matterbridge runs in Docker, use host networking as in the [Docker guide](https://matterbridge.io/README-DOCKER.html) (`--network host`, or `network_mode: host` in Compose). If you can't use it (bridge network, Docker Desktop, dev container), read the details below.

When Matterbridge runs in a container (Docker, Docker Desktop, a dev container) and the stream is viewed in a browser (Home Assistant, the OHF Matter Server dashboard), the video can stay black because the browser cannot reach the camera over UDP. See [Matterbridge WebRTC (werift) networking](https://matterbridge.io/Camera.html) for the cause and the `MATTERBRIDGE_ICE_PORT_RANGE` and `MATTERBRIDGE_ICE_HOST_ADDRESSES` overrides.

## Troubleshooting

- **The camera does not appear in the controller**: check that the controller supports Matter cameras, then restart the plugin after saving the configuration.
- **Play shows nothing**: the RTSP URL, user or password is wrong, or RTSP is disabled on the camera. Test the URL with VLC.
- **Black picture in the controller**: check the [WebRTC streaming in Docker](#webrtc-streaming-in-docker) section, and that ffmpeg is installed (the log shows `missing dependency ffmpeg`).
- **High CPU usage**: use the camera's sub stream, a lower resolution or a lower bitrate.

If the problem persists, set the Matterbridge log level to debug, reproduce the problem and open an [issue](https://github.com/Luligu/matterbridge-camera/issues) with the log.

## Development guide

Refer to the Matterbridge [Development guide](https://matterbridge.io/README-DEV.html) for other guidelines.

## Repository toolchain

See [TOOLCHAIN.md](./TOOLCHAIN.md) for compilers, linting, formatting, testing, and editor support.

## Shared agent instructions

See [SHARED-AGENTS.md](./SHARED-AGENTS.md) for shared guidance, rules, skills, and configuration for coding agents.

See [.agents/README.md](./.agents/README.md) for the shared instructions layout and versioning.

## Shared dev container support

See [.devcontainer/README.md](./.devcontainer/README.md) for the shared development container setup and usage.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## Style guide

See [STYLEGUIDE.md](./STYLEGUIDE.md) for code style, naming, documentation, and testing conventions.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history and notable changes.

## Issues and feature requests

Report bugs and suggest improvements on [GitHub Issues](https://github.com/Luligu/matterbridge-camera/issues).

## License

Licensed under the [Apache License 2.0](./LICENSE).

## Support the project

If you find this project useful, please consider giving it a star on [GitHub](https://github.com/Luligu/matterbridge-camera) and sponsoring it. Your support helps maintain and improve the project.

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/yellow_img.png)](https://www.buymeacoffee.com/luligugithub)
