import { randomUUID } from 'node:crypto';

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type MediaFolder = 'avatars' | 'banners';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

@Injectable()
export class StorageService {
  private readonly r2Bucket: string | null;
  private readonly r2PublicUrl: string | null;
  private readonly s3Client: S3Client | null;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID')?.trim();
    const bucket = this.configService.get<string>('R2_BUCKET')?.trim();
    const accessKeyId = this.configService
      .get<string>('R2_ACCESS_KEY_ID')
      ?.trim();
    const secretAccessKey = this.configService
      .get<string>('R2_SECRET_ACCESS_KEY')
      ?.trim();
    const endpointOverride = this.configService.get<string>('R2_ENDPOINT')?.trim();
    const publicUrl = this.configService.get<string>('R2_PUBLIC_URL')?.trim();

    this.r2Bucket = bucket ?? null;
    this.r2PublicUrl = publicUrl ?? null;

    if (!bucket || !accessKeyId || !secretAccessKey || (!accountId && !endpointOverride)) {
      this.s3Client = null;
      return;
    }

    const endpoint = endpointOverride ?? `https://${accountId}.r2.cloudflarestorage.com`;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async createSignedPutUrl(input: {
    clerkUserId: string;
    folder: MediaFolder;
    contentType?: string;
    fileName?: string;
  }): Promise<{
    uploadUrl: string;
    key: string;
    publicUrl: string;
    expiresIn: number;
  }> {
    this.assertStorageIsConfigured();

    const contentType = input.contentType || 'application/octet-stream';
    const extension = this.resolveExtension(contentType, input.fileName);
    const key = this.buildProfileAssetKey(input.clerkUserId, input.folder, extension);

    const command = new PutObjectCommand({
      Bucket: this.r2Bucket!,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client!, command, {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });

    return {
      uploadUrl,
      key,
      publicUrl: this.getPublicUrlForKey(key),
      expiresIn: SIGNED_URL_TTL_SECONDS,
    };
  }

  getPublicUrlForKey(key: string): string {
    this.assertStorageIsConfigured();
    const baseUrl = this.r2PublicUrl!.replace(/\/+$/, '');
    const normalizedKey = key.replace(/^\/+/, '');

    return `${baseUrl}/${normalizedKey}`;
  }

  private assertStorageIsConfigured(): void {
    if (!this.s3Client || !this.r2Bucket || !this.r2PublicUrl) {
      throw new InternalServerErrorException(
        'Storage no configurado. Revisá variables R2_* en backend.',
      );
    }
  }

  private buildProfileAssetKey(
    rawClerkUserId: string,
    folder: MediaFolder,
    extension: string,
  ): string {
    const clerkUserId = rawClerkUserId.replace(/[^a-zA-Z0-9_-]/g, '');

    if (clerkUserId.length === 0) {
      throw new InternalServerErrorException(
        'No se pudo construir una key de storage segura para el usuario.',
      );
    }

    return `profiles/${clerkUserId}/${folder}/${Date.now()}-${randomUUID()}.${extension}`;
  }

  private resolveExtension(contentType: string, fileName?: string): string {
    const normalizedContentType = contentType.toLowerCase();

    const fromContentType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
    };

    const extFromMime = fromContentType[normalizedContentType];
    if (extFromMime) {
      return extFromMime;
    }

    if (fileName && fileName.includes('.')) {
      const candidate = fileName.split('.').pop()?.toLowerCase();

      if (candidate && /^[a-z0-9]{2,8}$/.test(candidate)) {
        return candidate;
      }
    }

    return 'bin';
  }
}
