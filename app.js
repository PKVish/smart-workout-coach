const $=s=>document.querySelector(s);
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let voiceRecognition = null;
let voiceListening = false;
let voiceWanted = false;
let voiceRestartTimer = null;
let lastVoiceCommand = '';
let lastVoiceCommandAt = 0;
const VOICE_REPEAT_WINDOW_MS = 4000;
let selected,program,work=[],steps=[],at=0,timer,guide,left=0,elapsed=0,startAt=0,running=false,paused=false,wakeLock=null;
const fmt=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;function sec(v){let m=String(v||'').match(/(\d+)\s*(?:[–-]\s*\d+\s*)?(min|minute|sec|second)/i);return m?(/min/i.test(m[2])?+m[1]*60:+m[1]):0}function make(e,section,set=0,total=0){return{kind:'work',section,set,total,name:e.name||'Exercise',raw:e.duration||'',duration:sec(e.duration),rest:sec(e.rest_duration),reps:e.reps||'',instructions:e.instructions||'',seq:0,totalExercises:0}}function validate(j){
  return Boolean(
    j?.program_name &&
    Array.isArray(j.sections) &&
    j.sections.length > 0 &&
    j.sections.every(section =>
      typeof section.section_name === 'string' &&
      Array.isArray(section.sets) &&
      section.sets.every(set => Array.isArray(set.exercises))
    )
  );
}
function cleanInstructions(value){
  // Removes embedded citation markers such as [cite: 1] before display/speech.
  return String(value || '').replace(/\s*\[cite:\s*\d+\]/gi, '').trim();
}
function parse(j){
  if(!validate(j)) throw Error('Unsupported JSON schema. Expected sections[].sets[].exercises[].');

  work = [];
  j.sections.forEach(section => {
    const sectionName = section.section_name;
    section.sets.forEach(set => {
      set.exercises.forEach(exercise => {
        const normalized = make(
          {...exercise, instructions: cleanInstructions(exercise.instructions)},
          sectionName,
          set.set_number,
          set.total_sets || section.total_sets || section.sets.length
        );
        normalized.sectionDuration = section.total_duration || '';
        normalized.setDuration = set.duration || '';
        work.push(normalized);
      });
    });
  });

  work.forEach((exercise, index) => {
    exercise.seq = index + 1;
    exercise.totalExercises = work.length;
  });

  const result = [];
  work.forEach((exercise, index) => {
    result.push(exercise);
    if(exercise.rest){
      result.push({
        kind: 'rest',
        section: exercise.section,
        name: exercise.name,
        nextExercise: work[index + 1] || null,
        duration: exercise.rest,
        seq: exercise.seq,
        totalExercises: exercise.totalExercises
      });
    }
  });
  return result;
}
function item(e){
  return `${e.name} [${e.reps || e.duration || ''}]`;
}
function sectionTitle(name){
  if(name === 'warm_up') return 'Warm-up';
  if(name === 'cool_down') return 'Cool-down';
  if(name === 'workout') return 'Workout';
  return name.replaceAll('_', ' ');
}
function plan(j){
  const html = j.sections.map(section => {
    const setsHtml = section.sets.map(set => `
      <div class="set">
        <div class="set-label">Set ${set.set_number} of ${set.total_sets || section.total_sets || section.sets.length}${set.duration ? ` [${set.duration}]` : ''}</div>
        <ul>${set.exercises.map(exercise => `<li>${item(exercise)}</li>`).join('')}</ul>
      </div>`).join('');

    return `<div class="plan-section">
      <h3>${sectionTitle(section.section_name)} [${section.total_duration || ''}]</h3>
      ${setsHtml}
    </div>`;
  }).join('');

  $('#summary').textContent = `Total exercises: ${work.length} • Program duration: ${j.duration || ''}`;
  return html;
}
function setVoiceStatus(message){
  const element = $('#voiceStatus');
  if(element) element.textContent = message;
}
function normalizeVoiceCommand(transcript){
  const words = String(transcript || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.filter(word => ['skip','done','pause','resume'].includes(word));
}
function executeVoiceCommand(command){
  if(command === 'skip'){
    setVoiceStatus('Voice command: skip');
    next();
    return;
  }
  if(command === 'done'){
    const currentStep = steps[at];
    if(currentStep?.kind === 'work' && !currentStep.duration){
      setVoiceStatus('Voice command: done');
      next();
    }else{
      setVoiceStatus('Done is available only for a rep-based exercise.');
    }
    return;
  }
  if(command === 'pause'){
    if(running){
      clearInterval(timer);
      cancelAudio();
      running = false;
      paused = true;
      releaseWake();
      setVoiceStatus('Voice command: pause');
    }
    return;
  }
  if(command === 'resume'){
    if(paused && !running){
      const currentStep = steps[at];
      if(currentStep && !currentStep.duration) startAt = Date.now() - elapsed * 1000;
      setVoiceStatus('Voice command: resume');
      begin(true);
    }
  }
}
function acceptVoiceCommand(command, timestamp = Date.now()){
  if(command === lastVoiceCommand && timestamp - lastVoiceCommandAt <= VOICE_REPEAT_WINDOW_MS){
    lastVoiceCommand = '';
    lastVoiceCommandAt = 0;
    executeVoiceCommand(command);
  }else{
    lastVoiceCommand = command;
    lastVoiceCommandAt = timestamp;
    setVoiceStatus(`Say “${command}” again`);
  }
}
function processVoiceTranscript(transcript){
  const commands = normalizeVoiceCommand(transcript);
  for(const command of commands) acceptVoiceCommand(command);
}
function scheduleVoiceRestart(){
  clearTimeout(voiceRestartTimer);
  if(!voiceWanted || document.hidden || speechSynthesis.speaking) return;
  voiceRestartTimer = setTimeout(startVoiceRecognition, 350);
}
function startVoiceRecognition(){
  if(!SpeechRecognitionAPI){
    setVoiceStatus('Voice commands unavailable in this browser.');
    return;
  }
  voiceWanted = true;
  if(voiceListening || document.hidden || speechSynthesis.speaking) return;
  if(!voiceRecognition){
    voiceRecognition = new SpeechRecognitionAPI();
    voiceRecognition.lang = 'en-US';
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = false;
    voiceRecognition.maxAlternatives = 1;
    voiceRecognition.onstart = () => {
      voiceListening = true;
      setVoiceStatus('Voice commands active: say a command twice');
    };
    voiceRecognition.onresult = event => {
      for(let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex++){
        if(event.results[resultIndex].isFinal){
          processVoiceTranscript(event.results[resultIndex][0].transcript);
        }
      }
    };
    voiceRecognition.onerror = event => {
      voiceListening = false;
      if(event.error === 'not-allowed' || event.error === 'service-not-allowed'){
        voiceWanted = false;
        setVoiceStatus('Microphone permission is required for voice commands.');
      }else{
        setVoiceStatus(`Voice recognition: ${event.error}`);
      }
    };
    voiceRecognition.onend = () => {
      voiceListening = false;
      scheduleVoiceRestart();
    };
  }
  try{ voiceRecognition.start(); }catch(error){ scheduleVoiceRestart(); }
}
function suspendVoiceRecognition(){
  clearTimeout(voiceRestartTimer);
  if(voiceRecognition && voiceListening){
    try{ voiceRecognition.abort(); }catch(error){}
  }
  voiceListening = false;
}
function stopVoiceRecognition(){
  voiceWanted = false;
  lastVoiceCommand = '';
  lastVoiceCommandAt = 0;
  suspendVoiceRecognition();
  setVoiceStatus('Voice commands inactive');
}
async function acquireWake(){if(!running||document.visibilityState!=='visible'||!('wakeLock'in navigator))return;try{wakeLock=await navigator.wakeLock.request('screen');$('#wakeStatus').textContent='Screen awake: active';wakeLock.addEventListener('release',()=>{$('#wakeStatus').textContent='Screen awake: released'})}catch(e){$('#wakeStatus').textContent='Screen awake: unavailable'}}async function releaseWake(){if(wakeLock){await wakeLock.release().catch(()=>{});wakeLock=null}$('#wakeStatus').textContent='Screen awake: inactive'}function cancelAudio(){clearTimeout(guide);speechSynthesis.cancel()}function cancel(){clearInterval(timer);cancelAudio();running=false;releaseWake()}function speak(t){
  suspendVoiceRecognition();
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(t);
  utterance.onend = scheduleVoiceRestart;
  utterance.onerror = scheduleVoiceRestart;
  speechSynthesis.speak(utterance);
}
function load(j){cancel();try{steps=parse(j);selected=program=j;at=0;$('#program').textContent=`${j.program_name} • ${j.day||''}`;$('#plan').innerHTML=plan(j);$('#coach').classList.remove('hidden');$('#status').textContent='Workout planned.';show()}catch(e){$('#status').textContent=e.message}}function label(s){return sectionTitle(s.section)}function show(){let s=steps[at];if(!s)return ended();$('#phase').textContent=s.kind==='rest'?'Rest':`${label(s)}${s.set?` [${s.set} of ${s.total}]`:''}`;$('#name').textContent=s.kind==='rest'?'Recover':s.name;$('#timer').textContent=s.duration?fmt(s.duration):'00:00';$('#measure').textContent=s.kind==='rest'?`Next: ${s.nextExercise?.name||'Finish'}`:(s.reps||s.raw||'');$('#sequence').textContent=s.kind==='rest'?`After exercise ${s.seq} of ${s.totalExercises}`:`Exercise ${s.seq} of ${s.totalExercises}`;$('#done').classList.toggle('hidden',!!s.duration)}function exerciseAnnouncement(s){
  if(s.kind === 'rest'){
    const next = s.nextExercise;
    if(!next) return 'Rest. Next, finish workout.';
    const nextMeasure = next.reps || next.raw || '';
    return `Rest. Next exercise, ${next.name}${nextMeasure ? `. ${nextMeasure}.` : ''}`;
  }

  // Required order: exercise name, reps or duration, instructions.
  const measure = s.reps || s.raw || '';
  return [s.name, measure, s.instructions]
    .filter(Boolean)
    .join('. ') + '.';
}
function begin(resume=false){let s=steps[at];if(!s)return ended();running=true;paused=false;acquireWake();if(!resume){cancelAudio();left=s.duration;elapsed=0;startAt=Date.now();speak(exerciseAnnouncement(s))}timer=setInterval(s.duration?tick:up,1000)}function tick(){let s=steps[at];$('#timer').textContent=fmt(left);if(s.duration>4&&left===Math.ceil(s.duration/2)+2)speak('Approaching halfway');if([5,4,3,2,1].includes(left))speak(String(left));if(left--<=0)next()}function up(){elapsed=Math.floor((Date.now()-startAt)/1000);$('#timer').textContent=fmt(elapsed);if(elapsed&&elapsed%15===0)speak(`${elapsed} seconds`)}function next(){cancel();at++;if(at>=steps.length)return ended();show();begin()}function reset(){cancel();paused=false;show();begin()}function ended(){cancel();$('#phase').textContent='Complete';$('#name').textContent='Workout complete';$('#timer').textContent='✓';$('#measure').textContent='';$('#sequence').textContent=`${work.length} exercises completed`;$('#done').classList.add('hidden');$('#finish').classList.remove('hidden')}
document.addEventListener('visibilitychange',()=>{if(document.hidden){suspendVoiceRecognition()}else if(voiceWanted){scheduleVoiceRestart()}if(document.hidden&&running){clearInterval(timer);cancelAudio();running=false;paused=true;releaseWake();$('#status').textContent='Workout paused because the app became inactive.'}else if(!document.hidden&&running)acquireWake()});window.addEventListener('pagehide',()=>{if(running){clearInterval(timer);cancelAudio();running=false;paused=true;releaseWake()}});
function download(){if(!selected)return $('#status').textContent='Plan a workout first.';let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(selected,null,2)],{type:'application/json'}));a.download=`day${new Date().toISOString().replace(/\D/g,'').slice(0,14)}.json`;a.click()}function dateKey(){return new Date().toISOString().slice(0,10)}function calendar(){let d=new Date,y=d.getFullYear(),m=d.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),saved=JSON.parse(localStorage.getItem('workoutDays')||'{}');$('#month').textContent=d.toLocaleDateString([],{month:'long',year:'numeric'});let h=['S','M','T','W','T','F','S'].map(x=>`<div>${x}</div>`).join('')+'<div></div>'.repeat(first);for(let n=1;n<=days;n++){let k=`${y}-${String(m+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;h+=`<div class="${saved[k]?'completed':''}">${n}${saved[k]?' ✓':''}</div>`}$('#calendar').innerHTML=h}
$('#file').onchange=async e=>{try{selected=JSON.parse(await e.target.files[0].text());$('#status').textContent='Uploaded. Select Plan Upload.'}catch(e){selected=null;$('#status').textContent=e.message}};$('#planUpload').onclick=()=>selected?load(selected):$('#status').textContent='Upload JSON first.';$('#planJson').onclick=()=>{try{load(JSON.parse($('#json').value))}catch(e){$('#status').textContent=e.message}};$('#sample').onclick=async()=>load(await fetch('sample-workout.json').then(r=>r.json()));$('#download').onclick=download;$('#start').onclick=()=>{startVoiceRecognition();if(!running)begin(paused)};$('#pause').onclick=()=>{if(running){clearInterval(timer);cancelAudio();running=false;paused=true;releaseWake()}else if(paused){let s=steps[at];if(!s.duration)startAt=Date.now()-elapsed*1000;begin(true)}};$('#done').onclick=next;$('#skip').onclick=next;$('#reset').onclick=reset;$('#finish').onclick=()=>{let d=JSON.parse(localStorage.getItem('workoutDays')||'{}');d[dateKey()]=program.program_name;localStorage.setItem('workoutDays',JSON.stringify(d));calendar();$('#finish').classList.add('hidden')};calendar();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');