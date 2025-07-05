import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const deleteFolder = async (folderName) => {
  const folderPath = `pulseCast/${folderName}/`;
  let nextCursor = null;
  try {
    console.log(`🔍 Searching assets in folder: ${folderPath}`);
    do {
      const result = await cloudinary.search
        .expression(`folder:${folderPath}*`)
        .sort_by('public_id', 'desc')
        .max_results(100) // Max allowed per call
        .next_cursor(nextCursor)
        .execute();

      const assets = result.resources;
      nextCursor = result.next_cursor;

      if (assets.length === 0) {
        // console.log("✅ No assets found in the folder.");
        break;
      }

      for (const asset of assets) {
        try{
          const deleted = await cloudinary.uploader.destroy(asset.public_id, {
            resource_type: asset.resource_type,
          });
          // console.log(`🗑️ Deleted ${asset.public_id}:`, deleted);
        } 
        catch(error){
          console.error(`❌ Failed to delete ${asset.public_id}:`, err.message);
        }
      }
    } while (nextCursor);

    console.log(`✅ Finished deleting all assets in ${folderPath}`);

    // delete the empty folder structure
    // await cloudinary.api.delete_folder(folderPath);
    // console.log(`🧹 Deleted folder structure: ${folderPath}`);

  } 
  catch (err) {
    console.error(`❌ Error during folder deletion:`, err);
  }
};
