#!/usr/bin/env node
/** Official CC0 humanoid FBX sources, staged only. No Blender code is executed. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/studio-asset-expansion/modular-humanoid-sources');
const packs = [
  {
    id: 'modular-men', sourceUrl: 'https://quaternius.com/packs/ultimatemodularcharacters.html',
    folderId: '1m9JJ-hOYwMfZmpIaJGHbcTC3vxep2ief', licenseId: '1TTvylHa1CsiJuHFWWiv6PFGhLM-aAH5z',
    models: [
      ['Adventurer', '1vsz2vSbVJZfAslf4sb2bEniMETzm0FiD'], ['Beach', '1dyybNU-4EcLeZojgGrrjPjynr-HTy0K1'],
      ['Casual', '1yYfYKaOp-yPrpMQ_Am2bBIC-E7MTbffs'], ['Casual2', '1fd7_cf4Dvtt6kjxfsK7y-tWf7RK-gSfn'],
      ['Farmer', '1dNGrC-iyiIf2wHDPZZfb_7MuZkFPHUq-'], ['King', '1jQJCejZRC1LXqv6VTmyXxl4IkPPOUgrV'],
      ['Punk', '1wj4CJOdDMZxUUO6IHQphqR7gKXBGBviD'], ['Spacesuit', '1VtyiU3aQDgFWlQSS_zCKo01wJhGkk2gw'],
      ['Suit', '1cWnqDxminHIBU_7fYmPWErncEvjhHU6F'], ['Swat', '1h01FE-j9sx-L2ff610SWQU2kS_mShXRK'],
      ['Worker', '10dPAOOrlH6m6ASa3hOcc-ElclT_cIQjU'],
    ],
  },
  {
    id: 'modular-women', sourceUrl: 'https://quaternius.com/packs/ultimatemodularwomen.html',
    folderId: '1oBg0DQj5_MFfaBshrVb0MlJFcjQVld14', licenseId: '1lIFL16xEpoPbr0j_HUATgmcEnAmYoIK2',
    models: [
      ['Adventurer', '167P6xlB3Xbmgb_vCQdg_7XUmHKvNY6UY'], ['Casual', '1oeUCKrPzsKRv9t8gpe2kF0Ps_azVFRdf'],
      ['Formal', '1GfqxE7ZkoitlPueRj238MVAcf5-KYrw0'], ['Medieval', '1PDwGeJ38quzn8L3fBUI_GZHGBAh5f753'],
      ['Punk', '11R3oFaijDKL6rWslVfadzK6I4S6jhwVx'], ['SciFi', '1ebc8YJTFQZ9GZvLBhl7vGFJRl5sVjXUn'],
      ['Soldier', '1_JoVz8m1QGFIvZ7zAd8u4NWjExAu_cUe'], ['Suit', '1KfT8-WaxQQLDpHQlBsQFuhSXu80uO0vY'],
      ['Witch', '1tohNct1tGHAV89prDmSYOYtFDAad1KgV'], ['Worker', '1m2-hgysb7xhh3dfECiRnf5IYlc2GfI5P'],
    ],
  },
];
let total = 0;
async function download(id, limit) {
  let url = 'https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t';
  for (let redirects = 0; redirects <= 5; redirects++) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !['drive.google.com', 'drive.usercontent.google.com'].includes(target.hostname)
        || target.username || target.password || target.port) throw new Error('Unexpected download host');
    const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(45000),
      headers: { 'User-Agent': 'ToonStudio-AssetCuration/1.0 (official CC0 source acquisition)' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without location');
      url = new URL(location, target).href;
      continue;
    }
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > limit) throw new Error('Source response rejected: ' + response.status);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > limit || total + bytes > 32 * 1024 * 1024) throw new Error('Download budget exceeded');
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks); total += data.length;
    return { data, url, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  }
  throw new Error('Too many redirects');
}
await mkdir(output, { recursive: true });
const records = [];
const failures = [];
for (const pack of packs) {
  const directory = path.join(output, pack.id);
  await mkdir(directory, { recursive: true });
  const license = await download(pack.licenseId, 64 * 1024);
  if (!/creativecommons\.org\/publicdomain\/zero|CC0/iu.test(license.data.toString('utf8'))) throw new Error('Source license is not CC0');
  await writeFile(path.join(directory, 'License.txt'), license.data, { flag: 'wx' });
  for (const [name, id] of pack.models) {
    try {
      const file = await download(id, 4 * 1024 * 1024);
      if (!file.data.subarray(0, 24).toString('ascii').startsWith('Kaydara FBX Binary')) throw new Error('Expected an actual binary FBX, not a download page');
      const relative = pack.id + '/' + name + '.fbx';
      await writeFile(path.join(output, relative), file.data, { flag: 'wx' });
      records.push({ id: pack.id + '-' + name.toLowerCase(), name, path: relative,
        bytes: file.bytes, sha256: file.sha256, downloadUrl: file.url,
        sourceUrl: pack.sourceUrl, sourceFolder: 'https://drive.google.com/drive/folders/' + pack.folderId,
        license: 'CC0-1.0', licenseSha256: license.sha256,
        riggingVerified: false, visualReviewed: false, productionPublished: false });
      console.log('ACQUIRED', pack.id, name, file.bytes);
    } catch (error) {
      failures.push({ pack: pack.id, name, reason: String(error) });
      console.log('EXCLUDED', pack.id, name, String(error));
    }
  }
}
const report = { schema: 'toonspectrum.character-source-acquisition.v1', sources: records, failures,
  actualHumanoidSourceFiles: records.length, downloadedBytes: total,
  completedStudioCharacters: 0, productionPublished: false };
await writeFile(path.join(output, 'source-receipts.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ count: records.length, failures, downloadedBytes: total }));
if (!records.length) process.exitCode = 1;
