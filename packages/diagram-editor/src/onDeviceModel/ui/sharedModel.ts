import { createOnDeviceModel, type OnDeviceModel } from '../index';

let shared: OnDeviceModel | undefined;

/** The one model per page, shared by Preferences and the AI tab so Stop and the busy state agree. */
export function sharedOnDeviceModel(): OnDeviceModel {
  return shared ??= createOnDeviceModel();
}
