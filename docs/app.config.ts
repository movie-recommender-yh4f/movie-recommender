export default defineAppConfig({
  ui: {
    colors: {
      primary: "green",
      neutral: "zinc",
    },
    prose: {
      codeIcon: {
        sh: "i-vscode-icons-file-type-shell",
        bash: "i-vscode-icons-file-type-shell",
        ps1: "i-vscode-icons-file-type-powershell",
        powershell: "i-vscode-icons-file-type-powershell",
      },
    },
  },
  docus: {
    header: {
      logo: {
        src: "/favicon.svg",
        alt: "NextWatch Docs",
      },
    },
  },
});
