import { create } from "storybook/theming/create";
// Storybook chrome uses the current Realm colors. Production tokens stay in globals.css.
export const storybookTheme = create({
  base: "dark",
  brandTitle: "Realms · Components",
  brandImage: "/rw-logo.svg",
  brandUrl: "/?path=/docs/foundations-start-here--docs",
  colorPrimary: "#e7cf88",
  colorSecondary: "#e7cf88",
  appBg: "#050709",
  appContentBg: "#101417",
  appBorderColor: "#39372d",
  textColor: "#e8dcc2",
  barBg: "#101417",
  barTextColor: "#d8c8a8",
  barSelectedColor: "#e7cf88",
});
