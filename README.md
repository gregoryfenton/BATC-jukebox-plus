# BATC Video Jukebox v3.0

An interactive, automated streaming suite designed for the British Amateur Television Club (BATC) community. This project allows chat participants to control an OBS-based stream using intelligent commands, provides real-time system overlays, and automates content delivery.

## 🚀 Key Features
* **Intelligent Chat Parsing:** Fuzzy matching and substring command detection (e.g., `!p` suggests `!play`).
* **Dynamic OBS Overlays:** Automatic resizing of chat and video sources based on content metadata.
* **YouTube Integration:** Automatically displays QR codes and direct links for videos containing YouTube IDs.
* **ARRL News Ticker:** Real-time news scrolling with "Silent Key" (SK) detection that changes the UI color palette.
* **Ham Radio Tools:** Grid square distance calculations (`!loc`) and operator alerts (`!sysop`).
* **Standby DJ:** Automatically plays random videos after a period of inactivity to keep the stream alive.
* **Full messaging:** You can now send and receive text messages with other users (must have a callsign).

---

## 🛠 Prerequisites

Before installation, ensure you have the following software running:

1.  **OBS Studio 28+**: Required for WebSocket 5.x support.
2.  **Node.js & NPM**: To run the backend API server.
3.  **OBS-WebSocket (v5.x)**: Enabled in OBS (Tools -> WebSocket Server Settings).
4.  **Web Browser**: To run the `batc-overlay.html` as a Browser Source.
5.  **VLC Media Player**: (Optional) Recommended for viewers for low-latency RTMP playback.

---

## ⚙️ Configuration Variables

The `CONFIG` object in the overlay and server files controls the system logic. Here is a breakdown of the required variables:

### OBS Connectivity
| Variable | Description | Example |
| :--- | :--- | :--- |
| `addr` | The WebSocket address of your OBS instance. | `ws://127.0.0.1:4455` |
| `pass` | Your OBS WebSocket password. | `YourSecretPassword` |
| `scene` | The name of the primary OBS scene. | `Main Scene` |

### Source Mapping
| Variable | Description | Example |
| :--- | :--- | :--- |
| `source` | The Media Source used for video playback. | `Jukebox_Source` |
| `textSource` | GDI+ Text source for "Now Playing" info. | `Now_Playing_Text` |
| `chatSource` | The Browser Source containing the chat display. | `BATC Chat` |
| `qrImageSource` | The Image Source for the YouTube QR Code. | `Youtube QRCode` |
| `qrTextSource` | Text source for the YouTube URL. | `Youtube QRCode text` |
| `obsSKSource` | Source to enable when "Silent Key" is detected. | `Silent Key` |

### Station & API
| Variable | Description | Example |
| :--- | :--- | :--- |
| `room` | Your BATC channel/room name. | `M0ODZ` |
| `nick` | The name the bot uses in chat. | `JukeboxBot` |
| `api` | The local endpoint for the Node.js backend. | `http://127.0.0.1:3000` |
| `homeGrid` | Your station's 6-digit Maidenhead Grid Square. | `IO94gt` |
| `videoDir` | Absolute path to your video library. | `/home/greg/Videos/` |

---

## ⌨️ Command Guide

| Command | Usage | Description |
| :--- | :--- | :--- |
| `!list` | `!list` | Shows 5 random videos from the library. |
| `!play` | `!play [n]` | Plays video number [n] from the list. |
| `!request` | `!request [term]` | Searches library for a keyword/substring. |
| `!message` | `!message [msg]` | Saves a message for the station operator. |
| `!loc` | `!loc [grid]` | Saves your grid and calculates distance to station. |
| `!sysop` | `!sysop` | Triggers an audible alert in the operator's studio. |
| `!ping` | `!ping` | Returns real-time latency from BATC to the bot. |

---

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

![stream](https://github.com/user-attachments/assets/116de74f-970d-4cee-81c7-701f21b322ef)

![jukebox](https://github.com/user-attachments/assets/e7344ba1-353f-4fb2-8b70-b999dd762b60)



**73 de M0ODZ**
