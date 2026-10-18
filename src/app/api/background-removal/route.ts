import { removeBackground } from "@/lib/cloudinary";
import { cloudinaryRoute } from "@/lib/cloudinary-route";

/** Cloudinary may hold the request while it retries 423s. */
export const maxDuration = 60;

/** POST { image: dataUrl } → the background-removed PNG (see `cloudinaryRoute`). */
export const POST = cloudinaryRoute(removeBackground, "Background removal isn't set up yet.");
