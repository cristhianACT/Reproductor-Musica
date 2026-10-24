import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const sourceExe = 'C:/Users/crist/.aura-dist/Aura Music Player 1.0.0.exe';
const projectExe = path.resolve('Aura Music Player.exe');
const desktopExe = 'C:/Users/crist/OneDrive/Desktop/Aura Music Player.exe';

console.log('🔄 Sincronizando nuevo ejecutable...');

// Cerrar instancias previas si están abiertas para permitir sobreescritura
try {
  execSync('taskkill /IM "Aura Music Player.exe" /F', { stdio: 'ignore' });
} catch {}

try {
  if (fs.existsSync(sourceExe)) {
    fs.copyFileSync(sourceExe, projectExe);
    console.log(`✅ Actualizado en proyecto: ${projectExe}`);

    fs.copyFileSync(sourceExe, desktopExe);
    console.log(`✅ Actualizado en Escritorio: ${desktopExe}`);
  } else {
    console.warn('⚠️ No se encontró el archivo compilado en', sourceExe);
  }
} catch (err) {
  console.error('❌ Error copiando ejecutable:', err.message);
}
