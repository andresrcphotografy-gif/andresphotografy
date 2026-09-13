// Reconocimiento facial en el navegador (face-api).
// Todo se carga dinámicamente para no romper el renderizado en servidor.

type FaceApi = typeof import("@vladmandic/face-api");

const MODEL_URL =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

let apiPromise: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      return faceapi;
    })().catch((err) => {
      apiPromise = null;
      throw err;
    });
  }
  return apiPromise;
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/** Devuelve un descriptor de 128 dimensiones por cada rostro detectado. */
export async function descriptorsFromBlob(blob: Blob): Promise<number[][]> {
  const faceapi = await loadFaceApi();
  const img = await blobToImage(blob);
  const results = await faceapi
    .detectAllFaces(
      img,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 512,
        scoreThreshold: 0.4,
      }),
    )
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  return results.map((r) => Array.from(r.descriptor));
}

/** Descriptor del rostro más grande (para el selfie). */
export async function descriptorFromSelfie(
  blob: Blob,
): Promise<number[] | null> {
  const faceapi = await loadFaceApi();
  const img = await blobToImage(blob);
  const result = await faceapi
    .detectSingleFace(
      img,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: 512,
        scoreThreshold: 0.3,
      }),
    )
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return result ? Array.from(result.descriptor) : null;
}
