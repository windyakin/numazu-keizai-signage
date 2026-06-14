import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export function createStorageClient(): S3Client {
  return new S3Client({
    region: process.env.STORAGE_REGION ?? "auto",
    endpoint: process.env.STORAGE_ENDPOINT,
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
    },
  });
}

export async function uploadObject(
  client: S3Client,
  bucket: string,
  storageKey: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getObject(
  client: S3Client,
  bucket: string,
  storageKey: string
): Promise<{ body: ReadableStream; contentType: string }> {
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: storageKey })
  );
  if (!result.Body) throw new Error("Empty response body from storage");
  return {
    body: result.Body.transformToWebStream(),
    contentType: result.ContentType ?? "application/octet-stream",
  };
}

export async function deleteObject(
  client: S3Client,
  bucket: string,
  storageKey: string
): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}
