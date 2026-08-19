// Extracted from adam_landscape_in_use.spline.
// Camera track intentionally excluded. Source Timeline duration: 5 seconds.
// All animated transitions use Spline cubic easing [0.42,0] -> [0.58,1].

export const SPLINE_MOTION_DURATION = 5;
export const SPLINE_TIMELINE_ID = '7337b988-b195-48bc-b6d1-c38f47406410';

export const SPLINE_MOTION_TRACKS = [
  {
    key:'b1', splineId:'8d97aeff-d026-4fa4-9c5d-91f5f4e910ab',
    target:{name:'b1', parent:'building 1'},
    position:[
      {time:1.02,value:[0,-4.18,-1.4210854715202004e-14]},
      {time:1.50,value:[0,28.824590337556465,-1.4210854715202004e-14]}
    ],
    scale:[
      {time:1.02,value:[1,0,1]},
      {time:1.50,value:[1,1,1]}
    ]
  },
  {
    key:'b2Outer', splineId:'043b5ab9-1b76-426d-9155-eb5d32019ba9',
    target:{name:'b2', parent:'cluster 1'},
    position:[
      {time:1.00,value:[-348.99,-246.1,111.04]},
      {time:1.50,value:[-348.99,-195.7914015219736,111.04]}
    ],
    scale:[
      {time:1.00,value:[1,1,1]},
      {time:1.50,value:[1,1,1]}
    ]
  },
  {
    // Spline stores the same b2 position track on this nested helper group.
    // In the exported GLB it is a child of b2 with an identity local transform,
    // so it follows the outer b2 motion rather than applying the translation twice.
    key:'b2Inner', splineId:'13a2a82b-4f53-4a9d-a72f-a945afc7c00f',
    target:{name:'b2', parent:'b2', grandparent:'cluster 1'},
    parentFollow:true,
    sourcePosition:[
      {time:1.00,value:[-348.99,-246.1,111.04]},
      {time:1.50,value:[-348.99,-195.7914015219736,111.04]}
    ]
  },
  {
    key:'b2aOuter', splineId:'03e42968-4e61-4fab-8ab6-87860b0a7b28',
    target:{name:'b2a', parent:'b2', grandparent:'cluster 1'},
    position:[
      {time:1.50,value:[0,10.72,-2.842170943040401e-14]},
      {time:1.75,value:[0,62.12002005729909,-2.842170943040401e-14]}
    ],
    scale:[
      {time:1.50,value:[1,0,1]},
      {time:1.75,value:[1,1,1]}
    ]
  },
  {
    key:'b2aInner', splineId:'f0d8e632-0e28-453a-8d01-94ef701fab6d',
    target:{name:'b2a', parent:'b2', grandparent:'b2', greatgrandparent:'cluster 1'},
    position:[
      {time:1.50,value:[0,10.72,-2.842170943040401e-14]},
      {time:1.75,value:[0,62.12002005729909,-2.842170943040401e-14]}
    ],
    scale:[
      {time:1.50,value:[1,0,1]},
      {time:1.75,value:[1,1,1]}
    ]
  }
];

// CSS/Spline standard ease-in-out cubic: cubic-bezier(.42,0,.58,1).
export function splineEase(t){
  t=Math.max(0,Math.min(1,t));
  const x1=.42,y1=0,x2=.58,y2=1;
  const bx=u=>3*(1-u)*(1-u)*u*x1+3*(1-u)*u*u*x2+u*u*u;
  const by=u=>3*(1-u)*(1-u)*u*y1+3*(1-u)*u*u*y2+u*u*u;
  let lo=0,hi=1,u=t;
  for(let i=0;i<14;i++){u=(lo+hi)/2;if(bx(u)<t)lo=u;else hi=u;}
  return by(u);
}

export function sampleVec3(keys,time){
  if(!keys?.length)return null;
  if(time<=keys[0].time)return keys[0].value.slice();
  const last=keys[keys.length-1];
  if(time>=last.time)return last.value.slice();
  for(let i=0;i<keys.length-1;i++){
    const a=keys[i],b=keys[i+1];
    if(time>=a.time&&time<=b.time){
      const span=Math.max(1e-6,b.time-a.time);
      const f=splineEase((time-a.time)/span);
      return a.value.map((v,j)=>v+(b.value[j]-v)*f);
    }
  }
  return last.value.slice();
}
