import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const deleteFolder = async (olderThanDays = 1) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let nextCursor = undefined;

  try {
    console.log(`🔍 Deleting assets older than ${olderThanDays} days...`);

    do {
      const result = await cloudinary.search
        .expression(`created_at<=${cutoffDate.toISOString()}`)
        .sort_by('created_at', 'desc')
        .max_results(100)
        .next_cursor(nextCursor)
        .execute();

      const assets = result.resources;
      nextCursor = result.next_cursor;

      for (const asset of assets) {
        try {
          const delRes = await cloudinary.uploader.destroy(asset.public_id, {
            resource_type: asset.resource_type,
          });
          console.log(`🗑️ Deleted: ${asset.public_id}`, delRes.result);
        } catch (err) {
          console.error(`❌ Failed to delete ${asset.public_id}:`, err.message);
        }
      }
    } while (nextCursor);

    console.log("✅ Deletion process complete.");
  } catch (err) {
    console.error("❌ Error during deletion:", err);
  }
};