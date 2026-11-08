import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, flatten, join, weld, dequantize, compactPrimitive, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { mkdir, stat, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const [input, outputDirectory] = process.argv.slice(2);
if (!input || !outputDirectory) throw new Error('Usage: node optimize.mjs input.glb output-directory');
if (createHash('sha256').update(await readFile(input)).digest('hex') === '8d064b8dc6412bc324041d3f964c305994e683b6d427381958ce2807388cb776') {
  throw new Error('The original BMW M5 F90 is protected. Geometry, materials and textures must remain unchanged.');
}
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
function measure(doc) {
  const root = doc.getRoot();
  let triangles = 0, vertices = 0, primitives = 0;
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    primitives++;
    const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount();
    if (primitive.getMode() === 4) triangles += count / 3;
    vertices += primitive.getAttribute('POSITION').getCount();
  }
  return { triangles, vertices, primitives, meshes: root.listMeshes().length, materials: root.listMaterials().length,
    textures: root.listTextures().map(t => ({name:t.getName(),size:t.getSize(),bytes:t.getImage()?.byteLength ?? 0})) };
}
await mkdir(outputDirectory, {recursive: true});
const original = await io.read(input);
const baseline = {...measure(original), bytes: (await stat(input)).size};
console.log('INPUT', JSON.stringify(baseline));
console.log('MATERIALS', original.getRoot().listMaterials().map(m => m.getName()));
const report = { source: path.basename(input), baseline, profiles: {} };
function simplifyAppearance(profile) {
  return async document => {
    for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4 || !primitive.getIndices() || primitive.getIndices().getCount() < 600) continue;
      const position = primitive.getAttribute('POSITION');
      const normal = primitive.getAttribute('NORMAL');
      const uv = primitive.getAttribute('TEXCOORD_0');
      const stride = (normal ? 3 : 0) + (uv ? 2 : 0);
      const attributes = new Float32Array(position.getCount() * stride);
      const temp = [];
      for (let i=0;i<position.getCount();i++) {
        let offset = i * stride;
        if (normal) { normal.getElement(i,temp); attributes.set(temp.slice(0,3),offset); offset += 3; }
        if (uv) { uv.getElement(i,temp); attributes.set(temp.slice(0,2),offset); }
      }
      const oldIndices = primitive.getIndices();
      const indices = new Uint32Array(oldIndices.getArray());
      const weights = [...(normal ? [.25,.25,.25] : []), ...(uv ? [.1,.1] : [])];
      const target = Math.max(3, Math.floor(indices.length * profile.ratio / 3) * 3);
      const [result] = stride ? MeshoptSimplifier.simplifyWithAttributes(indices, position.getArray(), 3, attributes, stride, weights, null, target, profile.error, ['Permissive'])
        : MeshoptSimplifier.simplify(indices, position.getArray(), 3, target, profile.error, ['Permissive']);
      primitive.setIndices(document.createAccessor().setType('SCALAR').setBuffer(oldIndices.getBuffer()).setArray(result));
      compactPrimitive(primitive);
    }
  };
}
for (const profile of [
  { name: 'balanced', ratio: .4, error: .005, textureSize: 1024 },
  { name: 'mobile', ratio: .2, error: .01, textureSize: 512 },
]) {
  const document = await io.read(input);
  // This hero is a closed, stationary car: discard animation tracks only.
  document.getRoot().listAnimations().forEach(animation => animation.dispose());
  // Windows are opaque/tinted in this exterior-only hero, so the hidden cabin
  // and engine are unnecessary. Keep every exterior panel, lamp and badge.
  const hiddenMaterial = /^(INT_|int_|ENGINE$|M_Engine_Max$|interplastic|speakers|lightbutton$|amlightsspeaker$|hpdisplay|actext|stiches$|originalskin$|steer_stiches$)|InteriorA_Material|^Rim_Blurred/;
  let removedTriangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of [...mesh.listPrimitives()]) {
      if (!hiddenMaterial.test(primitive.getMaterial()?.getName() ?? '')) continue;
      removedTriangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3;
      mesh.removePrimitive(primitive);
      primitive.dispose();
    }
  }
  for (const material of document.getRoot().listMaterials()) {
    if (material.getName() === 'BUMWERK deep green metallic') material.setName('NOIR_BODY').setDoubleSided(false);
    if (material.getName() === 'BUMWERK black tinted glass') material.setName('NOIR_GLASS').setDoubleSided(false);
  }
  await document.transform(dedup(), prune(), flatten(), join(), dequantize(), weld(),
    simplifyAppearance(profile),
    prune(), dedup(),
    textureCompress({encoder: sharp, targetFormat: 'webp', resize: [profile.textureSize,profile.textureSize], quality: 85, effort: 60}),
    meshopt({encoder: MeshoptEncoder, level: 'high'}));
  const extras = document.getRoot().getAsset().extras ?? {};
  document.getRoot().getAsset().extras = {...extras, noirProfile: profile.name, sourceModel: 'https://sketchfab.com/3d-models/bmw-m5-f90-5478e978bd634337adc8e3dc413fbfa3', author: 'Res1n', license: 'CC-BY-4.0', redistributionSource: 'https://bumwerk.ru/promo/g30-tuning-v1/f90-project.glb', priorAdaptation: 'BUMWERK — material adaptation and mesh preparation', modifications: 'NOIR exterior-only hero; hidden cabin and engine removed; geometry simplification, texture resizing/WebP, meshopt compression'};
  const output = path.join(outputDirectory, `bmw-m5-f90-${profile.name}.glb`);
  await io.write(output, document);
  const verified = await io.read(output);
  report.profiles[profile.name] = {...measure(verified), bytes: (await stat(output)).size, removedHiddenTriangles: removedTriangles, settings:profile};
  console.log(profile.name.toUpperCase(), JSON.stringify(report.profiles[profile.name]));
}
await writeFile(path.join(outputDirectory, 'optimization-report.json'), JSON.stringify(report,null,2));
