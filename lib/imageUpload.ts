import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

const MAX_IMAGE_LABEL = `${MAX_IMAGE_BYTES / 1024 / 1024}MB`;

export interface PreparedImageAsset {
  uri: string;
  name: string;
  type: string;
}

export interface ImageFormPart extends PreparedImageAsset {
  bytes: () => Promise<Uint8Array>;
}

const requestPermission = async (source: 'gallery' | 'camera'): Promise<boolean> => {
  const { status } = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;
  Alert.alert('Permission Required', `${source === 'camera' ? 'Camera' : 'Photo library'} permission is needed.`);
  return false;
};

export const pickImageFromGallery = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
  try {
    if (!(await requestPermission('gallery'))) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    return result.canceled ? null : result.assets[0] || null;
  } catch {
    Alert.alert('Error', 'Failed to pick image. Please try again.');
    return null;
  }
};

export const captureImageWithCamera = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
  try {
    if (!(await requestPermission('camera'))) return null;
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.8 });
    return result.canceled ? null : result.assets[0] || null;
  } catch {
    Alert.alert('Error', 'Failed to take photo. Please try again.');
    return null;
  }
};

const compress = async (uri: string, width?: number, quality = 0.7) => {
  const actions = width ? [{ resize: { width } }] : [];
  return ImageManipulator.manipulateAsync(uri, actions, {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
};

export const prepareImageAsset = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<PreparedImageAsset | null> => {
  try {
    let output = await compress(asset.uri);
    let size = new File(output.uri).size;

    if (size > MAX_IMAGE_BYTES) {
      output = await compress(output.uri, 1920, 0.6);
      size = new File(output.uri).size;
    }
    if (size > MAX_IMAGE_BYTES) {
      output = await compress(output.uri, 1280, 0.4);
      size = new File(output.uri).size;
    }
    if (size > MAX_IMAGE_BYTES) {
      Alert.alert('Photo is too large', `Maximum size is ${MAX_IMAGE_LABEL}.`);
      return null;
    }

    const source = new File(output.uri);
    return {
      uri: output.uri,
      name: `image_${Date.now()}.jpg`,
      type: source.type || 'image/jpeg',
    };
  } catch {
    Alert.alert('Error', 'Failed to prepare image. Please try again.');
    return null;
  }
};

export const buildImageFormPart = (asset: PreparedImageAsset): ImageFormPart => {
  const source = new File(asset.uri);
  return {
    uri: asset.uri,
    name: asset.name,
    type: source.type || asset.type,
    bytes: () => source.bytes(),
  };
};
