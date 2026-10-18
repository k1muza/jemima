import { enhanceImage } from "@/lib/cloudinary";
import { cloudinaryRoute } from "@/lib/cloudinary-route";

/** Cloudinary may hold the request while it retries 423s. */
export const maxDuration = 60;

/** POST { image: dataUrl } → the enhanced image, PNG in and PNG out (see `cloudinaryRoute`). */
export const POST = cloudinaryRoute(enhanceImage, "Photo enhancement isn't set up yet.");
