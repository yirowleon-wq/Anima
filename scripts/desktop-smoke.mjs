import assert from 'node:assert/strict';
import {_electron} from 'playwright';
import {isolatedEnvironment} from './test-environment.mjs';
const env=isolatedEnvironment('desktop-smoke');
delete env.ANIMA_MODEL_TRANSPORT;
env.ANIMA_RUNTIME_ROOT=process.cwd();
const app=await _electron.launch({args:['.'],cwd:process.cwd(),env,timeout:30000});
try {
  const page=await app.firstWindow(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'More',exact:true}).waitFor();
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('menuitem',{name:'Open campus map',exact:true}).click();
  await page.locator('[data-ready="true"]').waitFor({state:'attached',timeout:30000});
  const version=await page.locator('[data-ready="true"]').getAttribute('data-version');
  assert(version?.startsWith('anima-'));
  await page.getByRole('button',{name:'Back to conversation',exact:true}).click();
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('menuitem',{name:'About you',exact:true}).click();
  await page.getByRole('button',{name:/Tell Anima something/}).waitFor({timeout:10000});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({status:'passed',scope:'real isolated Electron startup, shared map and memory entry',mapVersion:version,pageErrors:errors}));
} finally {await app.close();}

