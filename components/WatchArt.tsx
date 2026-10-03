import { watchSVG } from "@/lib/watch-drawing";
import type { Lot } from "@/lib/types";

type Props = {
  lot: Pick<Lot, "id" | "lot_number" | "brand" | "model" | "case_material" | "bracelet" | "dial_colour" | "bezel" | "shape" | "hands" | "photos">;
  prefix?: string;
  index?: number;
  alt?: string;
  eager?: boolean;
};

/** The lot's photo if there is one, otherwise a drawing made from its description. */
export function WatchArt({ lot, prefix = "w", index = 0, alt = "", eager }: Props) {
  const src = lot.photos?.[index];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="photo" src={src} alt={alt || `${lot.brand} ${lot.model}`} loading={eager ? "eager" : "lazy"} decoding="async" />;
  }
  return <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: watchSVG(lot, prefix) }} />;
}
