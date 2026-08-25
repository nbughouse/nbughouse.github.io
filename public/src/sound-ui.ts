import { getAssetPath } from "./app-paths";
import { soundThemes, type SoundName } from "./settings";
import { gs } from "./session";

export function playSound(source: SoundName): void {
    if (!gs.settings.sounds) return;

    const soundTheme =
        soundThemes.find((theme) => theme.id === gs.settings.soundTheme) ||
        soundThemes[0];
    const file = soundTheme.sounds[source] || soundTheme.sounds.move;
    if (!file) return;

    const sound = new Audio(getAssetPath(`sound/${soundTheme.id}/${file}`));
    console.log(`Playing sound: ${soundTheme.id}/${file}`);
    sound.play().catch((error) => console.error("Sound play failed:", error));
}
