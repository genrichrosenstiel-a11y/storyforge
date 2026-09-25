import express from "express";
import {GoogleGenAI} from "@google/genai";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const app=express();
app.use(express.json({limit:"2mb"}));
app.use(express.static("public"));
const PORT=process.env.PORT||3000;
const ROOT=path.join(process.cwd(),"work");
await fs.mkdir(ROOT,{recursive:true});
const jobs=new Map();

function run(cmd,args){return new Promise((resolve,reject)=>{let err="";const p=spawn(cmd,args);p.stderr.on("data",x=>err+=x);p.on("close",c=>c?reject(Error(err.slice(-7000)||"Process failed")):resolve())})}
function parseJSON(raw){const m=String(raw||"").match(/\{[\s\S]*\}/);if(!m)throw Error("Gemini hat kein gültiges JSON geliefert.");return JSON.parse(m[0])}
function eta(sec){if(!isFinite(sec)||sec<2)return"wird berechnet …";if(sec<60)return Math.ceil(sec)+" Sek.";return Math.floor(sec/60)+" Min. "+Math.ceil(sec%60)+" Sek."}
function set(id,data){const j=jobs.get(id);if(j)Object.assign(j,data)}

async function plan(ai,x){
 const prompt=`You are StoryForge, an autonomous Roblox content production agent.
FORMAT: ${x.format}
NICHE: ${x.niche}
TOPIC: ${x.topic||"choose a strong topic yourself"}
${x.format==="Longform"?"TARGET LENGTH: "+x.duration+" minutes":"TARGET LENGTH: 30 to 60 seconds"}

Return ONLY valid JSON:
{"title":"...","description":"...","hashtags":["..."],"voiceover":"...","scenes":[{"description":"...","image_prompt":"...","motion":"zoom_in"}]}

Rules:
- German output except image_prompt, which must be English.
- For Short use 6 to 12 scenes.
- For Longform decide the number of scenes yourself.
- Each image_prompt must request a vertical 9:16 original Roblox-inspired visual and maintain character/style continuity.
- motion must be one of zoom_in, zoom_out, pan_left, pan_right, pan_up, pan_down, drift, punch_zoom.
- Voiceover must be natural German and contain no hyphens or em dashes.
- The story must have a strong hook, escalation and payoff.
- Do not claim current trends as facts unless verified.`;
 const r=await ai.interactions.create({model:"gemini-3.8-flash",input:prompt});
 return parseJSON(r.output_text);
}
async function image(ai,prompt,file){
 const r=await ai.interactions.create({model:"gemini-3.1-flash-image",input:prompt,response_format:{type:"image",mime_type:"image/png",aspect_ratio:"9:16",image_size:"1K"}});
 if(!r.output_image?.data)throw Error("Bildgenerierung lieferte kein Bild.");
 await fs.writeFile(file,Buffer.from(r.output_image.data,"base64"));
}
async function tts(ai,text,file){
 const r=await ai.interactions.create({model:"gemini-3.8-flash-tts",input:[{type:"user_input",content:[{type:"text",text,annotations:[{type:"speech_metadata",style:"energetic, natural, expressive German social media narration"}]}]}],response_format:{type:"audio"},generation_config:{speech_config:[{voice:"Kore"}]}});
 if(!r.output_audio?.data)throw Error("Voiceover wurde nicht erzeugt.");
 await fs.writeFile(file,Buffer.from(r.output_audio.data,"base64"));
}
async function audioDuration(file){
 return new Promise((resolve,reject)=>{let e="";const p=spawn(ffmpegPath,["-i",file]);p.stderr.on("data",x=>e+=x);p.on("close",()=>{const m=e.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);if(!m)return reject(Error("Audio-Dauer konnte nicht gelesen werden."));resolve(+m[1]*3600+ +m[2]*60+ +m[3])})})
}
function motionFilter(m,d){const frames=Math.max(36,Math.round(d*24));const map={zoom_in:"zoompan=z='min(zoom+0.0015,1.12)'",zoom_out:"zoompan=z='max(1.12-on*0.0015,1)'",pan_left:"zoompan=z='1.08':x='iw/2-(iw/zoom/2)-on*0.5'",pan_right:"zoompan=z='1.08':x='iw/2-(iw/zoom/2)+on*0.5'",pan_up:"zoompan=z='1.08':y='ih/2-(ih/zoom/2)-on*0.35'",pan_down:"zoompan=z='1.08':y='ih/2-(ih/zoom/2)+on*0.35'",punch_zoom:"zoompan=z='min(zoom+0.004,1.15)'",drift:"zoompan=z='min(zoom+0.0008,1.08)'"};return `${map[m]||map.drift}:d=${frames}:s=1080x1920:fps=24`}
async function render(work,scenes,audio,out){
 const inputs=[],filters=[],labels=[];
 scenes.forEach((s,i)=>{inputs.push("-loop","1","-t",String(s.dur),"-i",path.join(work,`scene-${i}.png`));filters.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${motionFilter(s.motion,s.dur)}[v${i}]`);labels.push(`[v${i}]`)});
 filters.push(labels.join("")+`concat=n=${scenes.length}:v=1:a=0[v]`);
 const audioIndex=scenes.length;
 await run(ffmpegPath,[...inputs,"-i",audio,"-filter_complex",filters.join(";"),"-map","[v]","-map",`${audioIndex}:a`,"-c:v","libx264","-preset","veryfast","-crf","22","-pix_fmt","yuv420p","-c:a","aac","-shortest","-movflags","+faststart",out]);
}

async function produce(id,x){
 const started=Date.now();
 try{
  const key=process.env.GEMINI_API_KEY;if(!key)throw Error("GEMINI_API_KEY ist auf dem Server nicht gesetzt.");
  const ai=new GoogleGenAI({apiKey:key});const work=path.join(ROOT,id);await fs.mkdir(work,{recursive:true});
  const update=(percent,step,message,count)=>{const elapsed=(Date.now()-started)/1000;set(id,{percent,step,message,count,eta:percent>4?eta(elapsed*(100-percent)/percent):"wird berechnet …",status:"running"})};
  update(5,0,"Gemini entwickelt Thema, Hook und Story …");
  const p=await plan(ai,x);if(!p.scenes?.length||!p.voiceover)throw Error("Kein vollständiger Produktionsplan.");
  update(14,1,"Hook und Skript sind fertig.");
  for(let i=0;i<p.scenes.length;i++){update(15+Math.round(i/p.scenes.length*48),2,`Bild ${i+1} von ${p.scenes.length} wird erstellt …`,`${i+1} / ${p.scenes.length}`);await image(ai,p.scenes[i].image_prompt,path.join(work,`scene-${i}.png`))}
  update(66,3,"Deutsches Voiceover wird erzeugt …");const audio=path.join(work,"voice.wav");await tts(ai,p.voiceover,audio);
  update(74,4,"Untertitel und Timing werden vorbereitet …");
  const total=await audioDuration(audio);const weights=p.scenes.map(s=>Math.max(1,String(s.description||"").split(/\s+/).length));const sum=weights.reduce((a,b)=>a+b,0);const scenes=p.scenes.map((s,i)=>({...s,dur:Math.max(1.4,total*weights[i]/sum)}));
  update(82,5,"Bilder werden animiert und MP4 wird gerendert …");const out=path.join(work,"storyforge.mp4");await render(work,scenes,audio,out);
  update(96,7,"Finale Qualitätskontrolle …");const st=await fs.stat(out);if(st.size<10000)throw Error("Finales MP4 ist ungültig.");
  app.use("/video/"+id,express.static(work));set(id,{status:"done",percent:100,step:8,message:"Video erfolgreich fertiggestellt.",eta:"Fertig",videoUrl:"/video/"+id+"/storyforge.mp4",title:p.title,description:p.description,hashtags:p.hashtags});
 }catch(e){console.error(e);set(id,{status:"error",error:e.message,message:"Produktion wurde beendet."})}
}

app.get("/health",(req,res)=>res.json({ok:true}));
app.post("/api/jobs",(req,res)=>{const x=req.body||{};if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:"Server ist noch nicht mit Gemini verbunden. GEMINI_API_KEY fehlt."});const id=crypto.randomUUID();jobs.set(id,{status:"queued",percent:0,step:0,message:"Job wird gestartet …",created:Date.now()});produce(id,x);res.json({jobId:id})});
app.get("/api/jobs/:id",(req,res)=>{const j=jobs.get(req.params.id);if(!j)return res.status(404).json({error:"Job nicht gefunden."});res.setHeader("Cache-Control","no-store");res.json(j)});
app.listen(PORT,()=>console.log(`StoryForge listening on ${PORT}`));
