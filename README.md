# Shonenmagazine-ichicomi-downloader

Shonenmagazine and ichicomi downloader script to download + deobfuscation images for manga from shonenmagazine.com and ichicomi.com

## Installation

### Requirements

- Tampermonkey
- <b>Shonenmagazine only works on Chrome (or chrome based browser) and also needs to install:</b> 
  - Always active Window - Always Visible: https://chromewebstore.google.com/detail/always-active-window-alwa/ehllkhjndgnlokhomdlhgbineffifcbj
  - Run chrome with Disabled security flag to be able to save images from protected canvas.
- ichicomi works on both Chrome and Firefox based browsers.
### Installation

<b>Installation Video</b>: https://jumpshare.com/s/xytC9x5rzJ3dT20mvM7g

1. Tampermonkey and user script
   - Download Tampermonkey for your browser from [here](https://www.tampermonkey.net/). 
   - Chrome users also need
      - Enable developer mode in your chrome browser https://www.tampermonkey.net/faq.php#Q209
      - Allow `Allow User Scripts`: To go to Settings > Extensions > Manage Extensions > Click `Details` button under `Tampermonkey` extension card > Switch `Allow User Scripts` on.
   - Firefox doesn't need to enable developer mode.
   - Click on this link, and then click on the "Install" button to install user script:
     [shonenmagazine-downloader.user.js](https://raw.githubusercontent.com/boydaihungst/shonenmagazine-downloader/refs/heads/master/shonenmagazine-downloader.user.js)
   - The first time you click download button, make sure to select `always allow` button.
   
2. For Shonenmagazine website only (Only works on Chrome):
   - Install Always active Window - Always Visible extension ([click here](https://chromewebstore.google.com/detail/always-active-window-alwa/ehllkhjndgnlokhomdlhgbineffifcbj))
      - Go to https://pocket.shonenmagazine.com/ -> click `Always active Window - Always Visible` extension to active it (blue rectangle means it's activated for this website).
   - Run chrome with Disabled security flag:
      - Clone Chrome shortcut on desktop, change it name to `Unsafe Google Chrome`
      - Right click on it. In the `Target:` input box, add: ` --disable-web-security --user-data-dir="C:\temp"` at the end. For example: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir="C:\temp"`. Then click `Ok` button to save.
      - From now on, you only use that `Unsafe Google Chrome` to download manga from `Shonenmagazine website`. For any other jobs, just use the normal `Google Chrome` desktop shortcut. Be aware that it's unsafe for normal jobs.
      
   
### Usage

- Open any chapter of the manga in the browser: For example: https://pocket.shonenmagazine.com/episode/3270375685457628827
- Click on the "Download All Images as ZIP" button in the top right corner of the page
- If it asks for permission, click on the "always allow" button
- Wait for the download to complete, then extract the ZIP file.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
