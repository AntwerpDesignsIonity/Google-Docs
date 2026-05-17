// IONITY - Electron Forge build configuration.
module.exports = {
  packagerConfig: {
    name: "IONITY",
    arch: "all",
    buildIdentifier: "prod",
    appBundleId: "com.antwerpdesignsionity.ionity",
    appCopyright: "Copyright (c) AntwerpDesignsIonity. All Rights Reserved.",
    executableName: "ionity",
    icon: "./assets/icon",
    out: "./dist",
    win32metadata: {
      CompanyName: "AntwerpDesignsIonity",
      FileDescription: "IONITY Desktop",
      InternalName: "IONITY",
      ProductName: "IONITY",
    },
    appCategoryType: "public.app-category.productivity",
    darwinDarkModeSupport: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "IONITY",
        authors: "AntwerpDesignsIonity",
        copyright: "Copyright (c) AntwerpDesignsIonity. All Rights Reserved.",
        description: "IONITY Desktop",
        setupExe: "IONITY-Setup.exe",
        setupIcon: "./assets/icon.ico",
        loadingGif: "./assets/loading.gif",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "linux", "win32"],
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        name: "IONITY",
        background: "./assets/background.png",
        icon: "./assets/icon.icns",
      },
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          name: "ionity",
          genericName: "IONITY",
          productName: "IONITY",
          description: "IONITY Desktop",
          maintainer: "AntwerpDesignsIonity",
          icon: "./assets/icon.png",
          categories: ["Office", "Utility"],
        },
      },
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {
        options: {
          name: "ionity",
          genericName: "IONITY",
          productName: "IONITY",
          description: "IONITY Desktop",
          icon: "./assets/icon.png",
          categories: ["Office", "Utility"],
        },
      },
    },
  ],
  // No publishers: builds stay local. Distribute artifacts however you like.
  publishers: [],
};
