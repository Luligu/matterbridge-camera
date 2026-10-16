/**
 * @file vitest/module.test.ts
 * @description This file contains the tests for the CameraPlatform.
 * @author Luca Liguori
 */

const NAME = 'Platform';
const MATTER_PORT = 6000;

import { EventEmitter } from 'node:events';

import type { PlatformMatterbridge } from 'matterbridge';
import {
  addMatterbridge,
  createServerNode,
  createTestEnvironment,
  destroyTestEnvironment,
  getMatterbridge,
  log,
  loggerErrorSpy,
  loggerFatalSpy,
  loggerInfoSpy,
  loggerNoticeSpy,
  loggerWarnSpy,
  setDebug,
  setupTest,
  startServerNode,
  stopServerNode,
} from 'matterbridge/test-utils/vitest';

import initializePlugin, { CameraPlatform } from '../src/module.js';
import type { CameraPlatformConfig } from '../src/module.js';

const behaviors = vi.hoisted(() => ({
  hasFfmpeg: vi.fn(() => true),
  installFfmpeg: vi.fn(async () => true),
  spawn: vi.fn(),
  cameraOptions: vi.fn(),
}));

vi.mock('matterbridge/behaviors', async (importOriginal) => ({ ...(await importOriginal<typeof import('matterbridge/behaviors')>()), ...behaviors }));

const utils = vi.hoisted(() => ({
  isDocker: vi.fn(() => false),
}));

vi.mock('matterbridge/utils', async (importOriginal) => ({ ...(await importOriginal<typeof import('matterbridge/utils')>()), ...utils }));
vi.mock('node:child_process', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:child_process')>()), spawn: behaviors.spawn }));

vi.mock('matterbridge/devices/camera', async (importOriginal) => {
  const { Camera } = await importOriginal<typeof import('matterbridge/devices/camera')>();
  return {
    Camera: class extends Camera {
      constructor(...args: ConstructorParameters<typeof Camera>) {
        super(...args);
        behaviors.cameraOptions(args[2]?.weriftOfferOptions);
      }
    },
  };
});

await setupTest(NAME);

/**
 * Creates a fake ffplay process.
 *
 * @returns {EventEmitter & { kill: ReturnType<typeof vi.fn> }} The fake process.
 */
function createFakePlayer(): EventEmitter & { kill: ReturnType<typeof vi.fn> } {
  return Object.assign(new EventEmitter(), { kill: vi.fn() });
}

describe('TestPlatform', () => {
  let matterbridge: PlatformMatterbridge;
  let platform: CameraPlatform;

  const config: CameraPlatformConfig = {
    name: 'matterbridge-camera',
    type: 'DynamicPlatform',
    version: '1.0.0',
    autoInstallFfmpeg: true,
    cameras: {},
    debug: false,
    unregisterOnShutdown: false,
  };

  beforeAll(async () => {
    // Create Matterbridge environment
    await createTestEnvironment();
    await createServerNode(MATTER_PORT);
    await startServerNode();
    matterbridge = getMatterbridge();
  });

  beforeEach(() => {
    // Reset the mock calls before each test
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // No errors logged during tests
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    // Clear debug
    await setDebug(false);
  });

  afterAll(async () => {
    // Destroy Matterbridge environment
    await stopServerNode();
    await destroyTestEnvironment();
    // Restore all mocks
    vi.restoreAllMocks();
  });

  it('should throw error in load when version is not valid', () => {
    expect(() => initializePlugin({ ...matterbridge, matterbridgeVersion: '1.0.0' }, log, config)).toThrow(
      'This plugin requires Matterbridge version >= "3.10.14". Please update Matterbridge to the latest version in the frontend.',
    );
  });

  it('should initialize platform with config name', () => {
    platform = new CameraPlatform(matterbridge, log, config);
    addMatterbridge(platform);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Initializing platform ${config.name}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Platform ${config.name} initialized successfully`);
  });

  it('should call onStart with reason', async () => {
    await platform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${config.name} with reason: Test reason...`);
  });

  it('should call onConfigure', async () => {
    await platform.onConfigure();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Configuring platform ${config.name}...`);
  });

  it('should log at info level when onConfigChanged is called', async () => {
    await platform.onConfigChanged({ ...config });
    expect(loggerInfoSpy).toHaveBeenCalledWith(`The config of platform ${config.name} has been changed`);
  });

  it('should install ffmpeg on start when running in a container without the docker parameter and ffmpeg is missing', async () => {
    const containerPlatform = new CameraPlatform(matterbridge, log, { ...config });
    vi.spyOn(containerPlatform, 'wssSendSnackbarMessage').mockImplementation(() => {});
    behaviors.hasFfmpeg.mockReturnValue(false);
    utils.isDocker.mockReturnValueOnce(true);

    await containerPlatform.onStart();
    expect(behaviors.installFfmpeg).toHaveBeenCalledTimes(1);
    expect(loggerInfoSpy).toHaveBeenCalledWith('ffmpeg installed successfully');

    behaviors.installFfmpeg.mockClear();
    await containerPlatform.onStart();
    expect(behaviors.installFfmpeg).not.toHaveBeenCalled();
    behaviors.hasFfmpeg.mockReturnValue(true);
  });

  it('should install ffmpeg on start when running in docker and ffmpeg is missing', async () => {
    const dockerMatterbridge = { ...matterbridge, restartMode: 'docker' } as PlatformMatterbridge;
    const dockerPlatform = new CameraPlatform(dockerMatterbridge, log, { ...config });
    const snackbarSpy = vi.spyOn(dockerPlatform, 'wssSendSnackbarMessage').mockImplementation(() => {});
    behaviors.hasFfmpeg.mockReturnValue(false);

    await dockerPlatform.onStart();
    expect(behaviors.installFfmpeg).toHaveBeenCalledTimes(1);
    expect(loggerInfoSpy).toHaveBeenCalledWith('ffmpeg installed successfully');
    expect(snackbarSpy).toHaveBeenCalledWith('Installing ffmpeg...', 10, 'info');
    expect(snackbarSpy).toHaveBeenCalledWith('ffmpeg installed successfully', 10, 'success');

    snackbarSpy.mockClear();
    behaviors.installFfmpeg.mockResolvedValueOnce(false);
    await dockerPlatform.onStart();
    expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to install ffmpeg: install it manually in the container');
    expect(snackbarSpy).toHaveBeenCalledWith('Failed to install ffmpeg: install it manually in the container', 0, 'error');
    loggerErrorSpy.mockClear();
    behaviors.hasFfmpeg.mockReturnValue(true);
  });

  it('should register a camera for each camera on start', async () => {
    const cameraPlatform = new CameraPlatform(matterbridge, log, {
      ...config,
      cameras: {
        'Front Cam': { videoSource: 'rtsp://front/video', audioSource: 'rtsp://front/audio', videoResolution: '1280x720', videoBitrate: 2000 },
        'Desk Cam': { videoSource: '2', audioSource: '' },
      },
    });
    const registerSpy = vi.spyOn(cameraPlatform, 'registerDevice').mockResolvedValue();
    vi.spyOn(cameraPlatform, 'validateDevice').mockReturnValue(true);

    await cameraPlatform.onStart();
    expect(registerSpy).toHaveBeenCalledTimes(2);
    const [front, desk] = registerSpy.mock.calls.map(([device]) => device);
    expect(front.deviceName).toBe('Front Cam');
    expect(front.serialNumber).toBe('CAMERA-e1c174bd41f0c89c');
    expect(desk.deviceName).toBe('Desk Cam');
    expect(desk.serialNumber).toBe('CAMERA-c94623e15ec170a0');
    expect(behaviors.cameraOptions.mock.calls[0][0]).toEqual({
      offerVideo: true,
      offerAudio: true,
      videoSource: 'rtsp',
      videoSourceDevice: 'rtsp://front/video',
      audioSource: 'rtsp',
      audioSourceDevice: 'rtsp://front/audio',
      videoResolution: '1280x720',
      videoBitrate: 2000,
    });
    expect(behaviors.cameraOptions.mock.calls[1][0]).toMatchObject({ offerAudio: false, audioSource: 'none', videoResolution: undefined, videoBitrate: 1000 });
  });

  it('should wire a source containing test to the test source', async () => {
    const cameraPlatform = new CameraPlatform(matterbridge, log, {
      ...config,
      cameras: {
        'Test Video': { videoSource: 'test', audioSource: 'rtsp://front/audio' },
        'Test Audio': { videoSource: 'rtsp://front/video', audioSource: 'rtsp://test/audio' },
      },
    });
    vi.spyOn(cameraPlatform, 'registerDevice').mockResolvedValue();
    vi.spyOn(cameraPlatform, 'validateDevice').mockReturnValue(true);

    await cameraPlatform.onStart();
    expect(behaviors.cameraOptions.mock.calls[0][0]).toMatchObject({
      videoSource: 'test',
      videoSourceDevice: undefined,
      audioSource: 'rtsp',
      audioSourceDevice: 'rtsp://front/audio',
    });
    expect(behaviors.cameraOptions.mock.calls[1][0]).toMatchObject({
      videoSource: 'rtsp',
      videoSourceDevice: 'rtsp://front/video',
      audioSource: 'test',
      audioSourceDevice: undefined,
    });
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Camera Test Video uses the test video source');
    expect(loggerNoticeSpy).toHaveBeenCalledWith('Camera Test Audio uses the test audio source');
  });

  it('should follow the controller resolution and remove cameras from the next startup when config entries are removed', async () => {
    const cameraPlatform = new CameraPlatform(matterbridge, log, {
      ...config,
      cameras: { Front: { videoSource: 'rtsp://front/video', videoResolution: 'auto' } },
    });
    const registerSpy = vi.spyOn(cameraPlatform, 'registerDevice').mockResolvedValue();
    vi.spyOn(cameraPlatform, 'validateDevice').mockReturnValue(true);
    await cameraPlatform.onStart();
    expect(behaviors.cameraOptions).toHaveBeenLastCalledWith(expect.objectContaining({ videoResolution: undefined, videoBitrate: 1000, audioSource: 'none' }));
    registerSpy.mockClear();
    cameraPlatform.config.cameras = {};
    await cameraPlatform.onStart();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('should skip automatic installation outside Docker or when disabled or already installed', async () => {
    for (const [restartMode, autoInstallFfmpeg, hasFfmpeg] of [
      ['service', true, false],
      ['docker', false, false],
      ['docker', true, true],
    ] as const) {
      behaviors.hasFfmpeg.mockReturnValue(hasFfmpeg);
      const cameraPlatform = new CameraPlatform({ ...matterbridge, restartMode }, log, { ...config, cameras: {}, autoInstallFfmpeg });
      await cameraPlatform.onStart();
      expect(behaviors.installFfmpeg).not.toHaveBeenCalled();
    }
    behaviors.hasFfmpeg.mockReturnValue(true);
  });

  it('should not register a camera that is not valid on start', async () => {
    const cameraPlatform = new CameraPlatform(matterbridge, log, { ...config, cameras: { 'Front Cam': { videoSource: '0', audioSource: '' } } });
    const registerSpy = vi.spyOn(cameraPlatform, 'registerDevice').mockResolvedValue();
    const validateSpy = vi.spyOn(cameraPlatform, 'validateDevice').mockReturnValue(false);

    await cameraPlatform.onStart();
    expect(validateSpy).toHaveBeenCalledWith(['Front Cam', 'CAMERA-e1c174bd41f0c89c']);
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('should use a hashed serial number and truncate the name of a camera to 32 characters', async () => {
    const longName = 'A very long camera name that exceeds the Matter limit';
    const cameraPlatform = new CameraPlatform(matterbridge, log, { ...config, cameras: { [longName]: { videoSource: '0', audioSource: '' } } });
    const registerSpy = vi.spyOn(cameraPlatform, 'registerDevice').mockResolvedValue();
    vi.spyOn(cameraPlatform, 'validateDevice').mockReturnValue(true);

    await cameraPlatform.onStart();
    const [device] = registerSpy.mock.calls[0];
    expect(device.serialNumber).toMatch(/^CAMERA-[a-f0-9]{16}$/);
    expect(device.deviceName).toBe(longName.slice(0, 32));
  });

  it('should normalize missing config values when constructed', () => {
    const bare = { name: 'bare', type: 'DynamicPlatform', version: '1.0.0' } as unknown as CameraPlatformConfig;
    const barePlatform = new CameraPlatform(matterbridge, log, bare);
    expect(barePlatform.config.autoInstallFfmpeg).toBe(true);
    expect(barePlatform.config.cameras).toEqual({});
    expect(barePlatform.config.debug).toBe(false);
    expect(barePlatform.config.unregisterOnShutdown).toBe(false);
  });

  it('should default missing camera settings and preserve configured values', () => {
    const cameraPlatform = new CameraPlatform(matterbridge, log, {
      ...config,
      cameras: {
        Default: { videoSource: 'rtsp://default/video' },
        Custom: { videoSource: 'rtsp://custom/video', videoResolution: '1920x1080', videoBitrate: 2500 },
      },
    });

    expect(cameraPlatform.config.cameras.Default).toEqual({ videoSource: 'rtsp://default/video', videoResolution: 'auto', videoBitrate: 1000 });
    expect(cameraPlatform.config.cameras.Custom).toEqual({ videoSource: 'rtsp://custom/video', videoResolution: '1920x1080', videoBitrate: 2500 });
  });

  it('should use the default bitrate when a camera is added after construction', async () => {
    const cameraPlatform = new CameraPlatform(matterbridge, log, { ...config, cameras: {} });
    cameraPlatform.config.cameras.Added = { videoSource: 'rtsp://added/video' };
    vi.spyOn(cameraPlatform, 'registerDevice').mockResolvedValue();
    vi.spyOn(cameraPlatform, 'validateDevice').mockReturnValue(true);

    await cameraPlatform.onStart();

    expect(behaviors.cameraOptions).toHaveBeenLastCalledWith(expect.objectContaining({ videoSourceDevice: 'rtsp://added/video', videoBitrate: 1000 }));
  });

  it('should not play a camera without ffmpeg or without a video source', () => {
    behaviors.hasFfmpeg.mockReturnValueOnce(false);
    expect(platform.playCamera('Cam', { videoSource: 'Cam', audioSource: '' })).toBeUndefined();
    expect(loggerErrorSpy).toHaveBeenCalledWith('Cannot play camera Cam: ffmpeg is not installed');

    expect(platform.playCamera('Cam', { videoSource: '', audioSource: '' })).toBeUndefined();
    expect(loggerErrorSpy).toHaveBeenCalledWith('Cannot play camera Cam: the video source is empty');
    expect(behaviors.spawn).not.toHaveBeenCalled();
    loggerErrorSpy.mockClear();
  });

  it('should play a camera and replace the previous player', () => {
    const first = createFakePlayer();
    const second = createFakePlayer();
    behaviors.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second);

    expect(platform.playCamera('Cam', { videoSource: 'Cam', audioSource: 'Mic' })).toBe(first);
    expect(behaviors.spawn).toHaveBeenCalledWith('ffplay', ['-rtsp_transport', 'tcp', '-i', 'Cam'], { stdio: 'ignore' });
    expect(loggerInfoSpy).toHaveBeenCalledWith('Playing camera Cam...');

    expect(platform.playCamera('Cam', { videoSource: 'Cam', audioSource: '' })).toBe(second);
    expect(behaviors.spawn).toHaveBeenLastCalledWith('ffplay', ['-rtsp_transport', 'tcp', '-i', 'Cam', '-an'], { stdio: 'ignore' });
    expect(first.kill).toHaveBeenCalledTimes(1);

    first.emit('exit', 0);
    expect(second.kill).not.toHaveBeenCalled();
    second.emit('error', new Error('failed'));
    expect(loggerErrorSpy).toHaveBeenCalledWith('Player of camera Cam failed: failed');
    loggerErrorSpy.mockClear();
    second.emit('exit', 1);
    expect(loggerInfoSpy).toHaveBeenCalledWith('Player of camera Cam exited with code 1');
  });

  it('should kill the running players on shutdown', async () => {
    const player = createFakePlayer();
    behaviors.spawn.mockReturnValueOnce(player);
    platform.playCamera('Cam', { videoSource: 'Cam', audioSource: '' });

    await platform.onShutdown();
    expect(player.kill).toHaveBeenCalledTimes(1);
  });

  it('should handle play actions', async () => {
    // oxlint-disable-next-line unicorn/no-useless-undefined
    const playSpy = vi.spyOn(platform, 'playCamera').mockReturnValue(undefined);
    platform.config.cameras = { Cam: { videoSource: 'Cam', audioSource: '' } };

    await platform.onAction('play', 'true', 'root_cameras_Cam_play');
    expect(playSpy).toHaveBeenCalledWith('Cam', { videoSource: 'Cam', audioSource: '' });

    const formData = { ...config, cameras: { Other: { videoSource: 'Other', audioSource: '' } } };
    await platform.onAction('play', undefined, 'root_cameras_Other_play', formData);
    expect(playSpy).toHaveBeenLastCalledWith('Other', { videoSource: 'Other', audioSource: '' });

    await platform.onAction('play', undefined, 'root_cameras_Missing_play');
    expect(loggerErrorSpy).toHaveBeenCalledWith('Cannot play camera Missing: not found');
    loggerErrorSpy.mockClear();
  });

  it('should ignore unknown actions and play actions without a schema id', async () => {
    const playSpy = vi.spyOn(platform, 'playCamera');

    await platform.onAction('unknown', 'true', 'root_cameras_Cam_play');
    await platform.onAction('play');

    expect(playSpy).not.toHaveBeenCalled();
    expect(behaviors.spawn).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith('Received action play');
  });

  it('should report an existing ffmpeg installation without installing again', async () => {
    const snackbarSpy = vi.spyOn(platform, 'wssSendSnackbarMessage').mockImplementation(() => {});
    behaviors.hasFfmpeg.mockReturnValue(true);

    await platform.onAction('installFfmpeg');

    expect(behaviors.installFfmpeg).not.toHaveBeenCalled();
    expect(snackbarSpy).toHaveBeenCalledWith('ffmpeg is already installed', 10, 'info');
  });

  it('should install ffmpeg on demand and report success or failure', async () => {
    const snackbarSpy = vi.spyOn(platform, 'wssSendSnackbarMessage').mockImplementation(() => {});
    behaviors.hasFfmpeg.mockReturnValue(false);
    behaviors.installFfmpeg.mockResolvedValueOnce(true);

    await platform.onAction('installFfmpeg');

    expect(behaviors.installFfmpeg).toHaveBeenCalledTimes(1);
    expect(snackbarSpy).toHaveBeenCalledWith('Installing ffmpeg...', 10, 'info');
    expect(snackbarSpy).toHaveBeenCalledWith('ffmpeg installed successfully', 10, 'success');

    behaviors.installFfmpeg.mockResolvedValueOnce(false);
    await platform.onAction('installFfmpeg');

    const message = 'Failed to install ffmpeg: requires Linux, root privileges or passwordless sudo, and apk or apt-get. See the logs for details.';
    expect(behaviors.installFfmpeg).toHaveBeenCalledTimes(2);
    expect(loggerErrorSpy).toHaveBeenCalledWith(message);
    expect(snackbarSpy).toHaveBeenCalledWith(message, 0, 'error');
    loggerErrorSpy.mockClear();
    behaviors.hasFfmpeg.mockReturnValue(true);
  });

  it('should call onShutdown with reason', async () => {
    await platform.onShutdown('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Shutting down platform ${config.name} with reason: Test reason...`);
  });

  it('should restart and unregister devices if configured', async () => {
    platform = new CameraPlatform(matterbridge, log, config);
    addMatterbridge(platform);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Initializing platform ${config.name}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Platform ${config.name} initialized successfully`);

    await platform.onStart();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${config.name} with reason: no reason provided...`);

    const unregisterSpy = vi.spyOn(platform, 'unregisterAllDevices').mockResolvedValue();
    platform.config.unregisterOnShutdown = true;
    await platform.onShutdown();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Shutting down platform ${config.name} with reason: no reason provided...`);
    expect(unregisterSpy).toHaveBeenCalled();
  });
});
