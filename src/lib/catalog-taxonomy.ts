export type Department = {
  slug: string;
  title: string;
  description: string;
  /** Tag products with `dept-{slug}` (e.g. `dept-men`) or set `department_slug` in `catalog_products` */
  tag: string;
};

export const DEPARTMENTS: Department[] = [
  {
    slug: "men",
    title: "Men",
    description: "Sneakers, apparel, and accessories built for everyday wear.",
    tag: "dept-men",
  },
  {
    slug: "women",
    title: "Women",
    description: "Footwear and streetwear staples across sizes and silhouettes.",
    tag: "dept-women",
  },
  {
    slug: "kids",
    title: "Kids",
    description: "Youth sizes and durable picks for school, sport, and play.",
    tag: "dept-kids",
  },
  {
    slug: "accessories",
    title: "Accessories",
    description: "Bags, headwear, watches, and finishing touches.",
    tag: "dept-accessories",
  },
];

export function getDepartmentBySlug(slug: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.slug === slug);
}

/** Match tag convention `dept-{slug}` or common synonyms. */
export function inferDepartmentSlugFromTags(tags: string[]): string | null {
  const lower = tags.map((t) => t.trim().toLowerCase());
  for (const d of DEPARTMENTS) {
    if (lower.includes(d.tag)) return d.slug;
  }
  const joined = lower.join(" ");
  if (/\bmen'?s\b|\bmen\b|\bmens\b/.test(joined) && !/\bwomen/.test(joined)) return "men";
  if (/\bwomen'?s\b|\bwomens\b|\bladies\b/.test(joined)) return "women";
  if (/\bkids\b|\byouth\b|\bjunior\b/.test(joined)) return "kids";
  if (/\baccessor/.test(joined) || /\bbag\b|\bcap\b|\bhat\b|\bwatch\b/.test(joined)) return "accessories";
  return null;
}
