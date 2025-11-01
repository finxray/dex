export type MegaItem = {
  title: string;
  href: string;
};

export type MegaGroup = {
  heading: string;
  items: MegaItem[];
};

export type NavLink = {
  label: string;
  href: string;
  mega?: MegaGroup[];
};

