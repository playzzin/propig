import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve('public/downloads/android');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
for(const mode of Object.keys(manifest)){
 if(!/^[a-z0-9-]+$/.test(mode))throw Error('Invalid mode');
 const source=await fs.readFile(path.join(root,mode+'.png'));
 const output=await sharp(source).resize(132,132,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({lossless:true}).toBuffer();
 const metadata=await sharp(output).metadata();if(metadata.width!==132||metadata.height!==132)throw Error('Preview dimensions');
 if(process.argv.includes('--check')){
  const existing=await fs.readFile(path.join(root,mode+'-preview.webp'));
  if(!existing.equals(output))throw Error('Stale preview: '+mode);
 }else await fs.writeFile(path.join(root,mode+'-preview.webp'),output);
 console.log(`${mode}: ${source.length} -> ${output.length} bytes, 132px lossless WebP preview`);
}
