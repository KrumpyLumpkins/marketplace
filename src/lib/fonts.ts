import { Exo_2, Geist_Mono } from "next/font/google";
export const exo2 = Exo_2({
  variable: "--font-exo-2",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
