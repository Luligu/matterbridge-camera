# To do list

- [ ] Implement Hikvision/EZVIZ SADP camera discovery.
  - Send an XML inquiry probe over UDP to multicast `239.255.255.250:37020`, using a unique request UUID:
    ```xml
    <Probe><Uuid>unique-request-id</Uuid><Types>inquiry</Types></Probe>
    ```
  - Listen on UDP port `37020` for `ProbeMatch` replies and correlate their UUID with the request.
  - Parse model (`DeviceDescription`), IP address, MAC address, firmware (`SoftwareVersion`), and advertised service ports. Deduplicate devices by MAC address.
  - Support selecting LAN interfaces, a bounded discovery timeout, socket cleanup, and safe handling of malformed replies across Windows, macOS, and Linux.
  - Keep discovery read-only and independent of camera credentials; stream authentication is a separate step.
  - Add tests for probe generation, reply parsing, UUID matching, duplicate replies, malformed replies, and timeout cleanup.
  - Verified on 2026-10-29: an EZVIZ TY1 (`CS-TY1-R101-1G2WF`) answered a multicast-only probe from a Raspberry Pi Ethernet interface, with a matching UUID. No direct IP probe was needed.
  - Documentation: [Hikvision SADP overview and activation](https://enpinfo.hikvision.com/hkwsen/unzip/20200602190713_90241_doc/GUID-64856ED5-DCB0-4787-B770-10AC9827DDD3.html) and [Hikvision camera manual — SADP Software Introduction appendix](https://www.hikvision.com/content/dam/hikvision/products/S000000001/S000000002/S000000003/S000000025/OFR000038/M000000146/SM000058570/User_Manual/UD19347B-C_Baseline_User-Manual-of-Network-Camera_V5.6.5_20231228.pdf). These describe the tool and workflow; the wire-format notes above come from the successful LAN probe.

- [ ] Implement optional Hikvision/EZVIZ SDK capability queries and pan/tilt controls.
  - Authenticate to the SADP-advertised command port (TCP `8000` on the tested TY1) using configured credentials; never log credentials.
  - Query `NET_DVR_GetDeviceAbility`: `DEVICE_SOFTHARDWARE_ABILITY` (`0x001`) for basic capabilities and `DEVICE_ABILITY_INFO` (`0x011`) for PTZ capabilities, using `<PTZAbility version="2.0"><channelNO>1</channelNO></PTZAbility>` as the tested PTZ request.
  - Use `NET_DVR_PTZControlWithSpeed_Other` for controls without an SDK video preview. `NET_DVR_PTZControlWithSpeed` requires an active preview handle.
  - Pair every movement start (`dwStop=0`) with an explicit stop (`dwStop=1`), including error/cancellation cleanup; bound movement duration and handle stop failures.
  - Tested commands: `PAN_LEFT=23` and `TILT_UP=21`, channel `1`, minimum speed `1`. Gate controls on reported capabilities and actual command results; a generic capability list does not establish that every listed accessory exists.
  - Keep native SDK integration optional and account for platform/architecture compatibility across Windows, macOS, and Linux. The successful test used ARM64 HCNetSDK build `0x06010865` on Raspberry Pi; test files are isolated at `/home/lligu/work/hik-sdk-test` on that Pi.
  - Add tests for capability parsing, unsupported operations, SDK errors, movement duration limits, and guaranteed stop/SDK session cleanup.
  - Verified on 2026-10-29 with EZVIZ TY1 (`CS-TY1-R101-1G2WF`): SDK login and basic/PTZ queries succeeded; pan-left and tilt-up starts and stops all returned success after 0.25-second movements. Physical movement was not visually verified. No ONVIF discovery response was received in separate tests.
  - Documentation: [Capability query API](https://open.hikvision.com/hardware/definitions/NET_DVR_GetDeviceAbility.html), [PTZ control without preview](https://open.hikvision.com/hardware/definitions/NET_DVR_PTZControlWithSpeed_Other.html), and [PTZ control with preview](https://open.hikvision.com/hardware/definitions/NET_DVR_PTZControlWithSpeed.html).
