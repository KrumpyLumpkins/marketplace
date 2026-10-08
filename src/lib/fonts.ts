import localFont from "next/font/local";
export const exo2 = localFont({
  src: "../../public/brand/fonts/exo-2-variable.ttf",
  variable: "--font-exo-2",
  weight: "400 700",
  display: "swap",
});
export const geistMono = localFont({
  src: "../../public/brand/fonts/geist-mono-variable.ttf",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});
export const fontClassName = `${exo2.variable} ${geistMono.variable}`;

// Bind semantic tokens where the font loader classes live, rather than resolving them
// at :root before next/font's body-level variables exist.
const cssFamily = (family: string) =>
  family.includes(",") || /^['"]/.test(family)
    ? family
    : JSON.stringify(family);
export const fontVariables = {
  "--font-sans": cssFamily(exo2.style.fontFamily),
  "--font-ui": cssFamily(exo2.style.fontFamily),
  "--font-mono": cssFamily(geistMono.style.fontFamily),
} as import("react").CSSProperties;
