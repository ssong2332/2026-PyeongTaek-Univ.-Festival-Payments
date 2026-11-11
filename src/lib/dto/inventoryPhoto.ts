import { z } from "zod";

export const InventoryPhotoSchema = z.object({
    id: z.uuid(),
    capturedBy: z.string(),
    capturedAt: z.iso.datetime({ offset: true }),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive(),
    imageUrl: z.url(),
});
export const InventoryPhotosResponseSchema = z.object({
    photos: z.array(InventoryPhotoSchema),
    hasMore: z.boolean(),
    nextOffset: z.number().int().nonnegative(),
    unavailableCount: z.number().int().nonnegative(),
});
export type InventoryPhoto = z.infer<typeof InventoryPhotoSchema>;
