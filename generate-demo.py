import wave, math, random, array
sr=24000
rng=random.Random(120)
out=array.array('h')
beat=60/114
notes=[43,43,50,46,39,39,46,48,46,46,53,50,41,41,48,53]
for i in range(round(sr*beat*32)):
 t=i/sr;n=int(t/beat);p=t%beat; h=t%(beat/2)
 kick=math.sin(math.tau*(48*p+3.0*(1-math.exp(-p*39))))*math.exp(-p*15)
 snare=(rng.random()*2-1)*math.exp(-p*27)*(n%2)*.3
 hat=(rng.random()*2-1)*math.exp(-h*95)*.12
 f=440*2**((notes[n%16]-69)/12)
 bass=(math.sin(math.tau*f*t)+.23*math.sin(math.tau*f*2*t))*(1-math.exp(-p*45))*math.exp(-p*5)
 k=t%(beat/4);lead=440*2**((notes[(int(t/beat*4)//2)%16]+[12,19,24,27][int(t/beat*4)%4]-69)/12)
 arp=math.sin(math.tau*lead*t+math.sin(math.tau*lead*2*t)*.8)*math.exp(-k*15)*(1-math.exp(-k*100))
 mix=.48*kick+.18*bass+.11*arp+snare+hat
 out.append(round(31000*mix*min(1,t*45,(beat*32-t)*30)))
with wave.open('public/phase-zero.wav','wb') as w:
 w.setparams((1,2,sr,0,'NONE','not compressed'));w.writeframes(out.tobytes())
