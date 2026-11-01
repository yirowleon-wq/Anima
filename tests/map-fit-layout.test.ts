import test from 'node:test';
import assert from 'node:assert/strict';
import { captionInsets, captionLines, endpointCaptionGap, fitControlGap, fitInsets, type FitRect } from '../src/renderer/map/fit-layout';
import { nativeCaptionBounds } from '../src/renderer/map/native-caption-bounds';
const rect=(left:number,top:number,width:number,height:number):FitRect=>({left,top,width,height,right:left+width,bottom:top+height});

test('Route fitting reserves endpoint captions beyond the actual top controls rather than fitting anchors alone',()=>{
 const stage=rect(0,56,431,579),mode=rect(16,130,107,44);
 // The observed old native caption crosses the mode button, including more
 // than its two-pixel collision padding. This is the regression witness.
 const oldCaption=rect(85.72,160.887,63.125,19.5625);
 assert.ok(Math.min(oldCaption.bottom,mode.bottom)-Math.max(oldCaption.top,mode.top)>10);
 const caption=captionInsets(['West Classroom'],{font:'13px sans-serif',size:13,offsetY:-27.3,padding:2,marker:13.5,maxWidthEm:14},()=>59.125);
 const result=fitInsets(stage,{top:[mode],right:[rect(370,76,44,330)],bottom:[rect(16,575,399,45)],card:rect(16,366,346,208)},caption);
 assert.equal(result.labelSpace,true);
 const topmostCaption=stage.top+result.padding.top-caption.top;
 assert.ok(topmostCaption>=mode.bottom+fitControlGap);
 assert.ok(result.padding.left+result.padding.right<stage.width);
});

test('A wide side panel occupies only the left; collapsing a narrow bottom panel frees height',()=>{
 const caption={top:38,right:32,bottom:14,left:32};
 const wide=fitInsets(rect(0,62,1280,658),{top:[rect(28,82,312,108)],right:[rect(1206,82,48,340)],bottom:[rect(28,680,380,25)],card:rect(28,458,420,195)},caption);
 assert.equal(wide.labelSpace,true);assert.equal(wide.padding.left,28+420+fitControlGap+32);
 assert.ok(wide.padding.bottom<100);
 const stage=rect(0,56,431,579),common={top:[rect(16,76,300,98)],right:[],bottom:[]};
 const expanded=fitInsets(stage,{...common,card:rect(16,366,346,208)},caption);
 const collapsed=fitInsets(stage,{...common,card:rect(16,540,346,60)},caption);
 assert.ok(collapsed.padding.bottom<expanded.padding.bottom);
});

test('Long names use wrapped bounds and the whole caption stays above the endpoint marker',()=>{
 const layout={font:'13px sans-serif',size:13,offsetY:-endpointCaptionGap,padding:2,marker:13.5,maxWidthEm:14,anchor:'bottom' as const};
 const measure=(text:string)=>Array.from(text).length*13;
 const name='An example campus building with a name that wraps across several lines',short=captionInsets(['A3'],layout,measure),long=captionInsets([name],layout,measure);
 assert.equal(captionLines(name,182,measure).join(''),name);
 assert.ok(long.left>short.left);assert.ok(long.top>short.top);
 assert.equal(long.bottom,13.5);
 const oblique=captionInsets(['A3'],{...layout,scale:1.4},measure);
 assert.ok(oblique.left>short.left);assert.ok(oblique.top>short.top);
});

test('Native laid-out caption bounds accept only a complete current endpoint set with matching names',()=>{
 const feature={properties:{id:'place/a',kind:'selection-name',name:'Current name'},loadGeometry:()=>[[{x:1,y:2}]]};
 const index={bucketLayerIDs:[['endpoint-names']],sourceLayerCoder:{decode:()=> 'geojson'},loadVTLayers:()=>({geojson:{feature:()=>feature}})};
 const empty={width:600,height:800,boxKeys:[],bboxes:[]};
 const collisionIndex={grid:{...empty,boxKeys:[{bucketInstanceId:1,featureIndex:0}],bboxes:[110,140,150,160]},ignoredGrid:empty,projectAndGetPerspectiveRatio:()=>({x:130,y:170})};
 const retained={featureIndex:index,bucketIndex:0,sourceLayerIndex:0,tileID:{toUnwrapped:()=>({})}};
 const map:any={style:{placement:{transform:{width:400,height:600},retainedQueryData:{1:retained},collisionIndex}}};
 const measured=nativeCaptionBounds(map,new Map([['place/a','Current name']]));
 assert.deepEqual(measured,{insets:{top:30,right:20,bottom:13.5,left:20},boxes:[[10,40,50,60]]});
 assert.equal(nativeCaptionBounds(map,new Map([['place/a','Previous name']])),undefined);
 assert.equal(nativeCaptionBounds(map,new Map([['place/a','Current name'],['place/b','Missing name']])),undefined);
 assert.equal(nativeCaptionBounds(map,new Map()),undefined);
});

test('Controls or titles that cannot fit do not produce false caption fits or invalid camera padding',()=>{
 for(const stage of [rect(0,0,0,0),rect(0,0,100,80)]){
  const result=fitInsets(stage,{top:[rect(0,0,100,60)],right:[],bottom:[],card:rect(0,60,100,20)},{top:80,right:120,bottom:50,left:120});
  assert.equal(result.labelSpace,false);
  assert.ok(Object.values(result.padding).every(n=>Number.isFinite(n)&&n>=0));
  assert.ok(result.padding.left+result.padding.right<=Math.max(0,stage.width-1));
  assert.ok(result.padding.top+result.padding.bottom<=Math.max(0,stage.height-1));
 }
});
