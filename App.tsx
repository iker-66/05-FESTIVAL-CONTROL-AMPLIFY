import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { FestivalEvent, EventStatus } from './src/data';
import { configureBackend, confirmRegistration, createEvent, deleteEvent, getSignedInUser, logIn, logOut, observeEvents, register, updateEvent } from './src/backend';
import { theme as c } from './src/theme';

type Page = 'dashboard' | 'events' | 'form';
type AuthMode = 'signIn' | 'signUp' | 'confirm';
const stages = ['MAIN STAGE', 'GARDEN', 'WAREHOUSE', 'RIVER STAGE'];
const statuses: EventStatus[] = ['CONFIRMED', 'DELAYED', 'CANCELLED'];

function Action({ label, onPress, secondary = false, danger = false }: {label: string; onPress: () => void; secondary?: boolean; danger?: boolean}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}) => [s.button, secondary && s.buttonSecondary, danger && s.buttonDanger, pressed && {opacity: .75}]}>
    <Text style={s.buttonText}>{label}</Text>
  </Pressable>;
}
function Status({value}: {value: EventStatus}) {
  const color = value === 'CONFIRMED' ? c.green : value === 'DELAYED' ? c.amber : c.red;
  return <Text style={[s.status, {color}]}>● {value}</Text>;
}
function EventCard({event, canManage, onEdit, onStatus, onDelete}: {event: FestivalEvent; canManage: boolean; onEdit: () => void; onStatus: () => void; onDelete: () => void}) {
  return <View style={s.card}>
    <View style={s.cardHeader}><Text style={s.time}>{event.time}</Text><Status value={event.status}/></View>
    <Text style={s.artist}>{event.artist}</Text>
    <Text style={s.space}>{event.space} · {event.id}</Text>
    {canManage && <View style={s.cardActions}>
      <Pressable accessibilityRole="button" onPress={onEdit}><Text style={s.actionText}>EDITAR</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onStatus}><Text style={s.actionText}>CAMBIAR ESTADO</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onDelete}><Text style={[s.actionText,{color:c.red}]}>ELIMINAR</Text></Pressable>
    </View>}
  </View>;
}
export default function App() {
  const {width} = useWindowDimensions();
  const wide = width > 860;
  const [page,setPage] = useState<Page>('dashboard');
  const [events,setEvents] = useState<FestivalEvent[]>([]);
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('TODOS');
  const [editing,setEditing] = useState<string | null>(null);
  const [artist,setArtist] = useState('');
  const [space,setSpace] = useState(stages[0]);
  const [time,setTime] = useState('21:45');
  const [status,setStatus] = useState<EventStatus>('CONFIRMED');
  const [notice,setNotice] = useState('');
  const [backendError,setBackendError] = useState('');
  const [user,setUser] = useState<{username: string} | null>(null);
  const [authMode,setAuthMode] = useState<AuthMode>('signIn');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirmationCode,setConfirmationCode] = useState('');
  const [busy,setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    let subscription: {unsubscribe: () => void} | undefined;
    configureBackend().then(async () => {
      const signedInUser = await getSignedInUser();
      if (!mounted) return;
      setUser(signedInUser ? {username: signedInUser.username} : null);
      subscription = observeEvents(setEvents, error => setBackendError(error.message));
    }).catch(error => {
      if (mounted) setBackendError(error instanceof Error ? error.message : 'No se pudo conectar con el backend.');
    });
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  },[]);

  const filtered = useMemo(() => events.filter(e => (filter === 'TODOS' || e.space === filter) && (e.artist.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase()))),[events,search,filter]);
  const openNew = () => {if(!user){setNotice('Inicia sesión para administrar la programación.');return;}setEditing(null);setArtist('');setSpace(stages[0]);setTime('21:45');setStatus('CONFIRMED');setNotice('');setPage('form');};
  const openEdit = (e: FestivalEvent) => {setEditing(e.id);setArtist(e.artist);setSpace(e.space);setTime(e.time);setStatus(e.status);setNotice('');setPage('form');};
  const save = async () => {
    if(!artist.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){setNotice('Introduce un artista y una hora válida (HH:MM).');return;}
    if(!user){setNotice('Inicia sesión para administrar la programación.');return;}
    setBusy(true);
    try {
      const event = {artist:artist.trim().toUpperCase(),space,time,status};
      if(editing){await updateEvent(editing,event);setNotice('Evento actualizado.');}
      else {await createEvent(event);setNotice('Evento creado.');}
      setPage('events');
    } catch(error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar el evento.');
    } finally {
      setBusy(false);
    }
  };
  const changeStatus = async (event:FestivalEvent) => {
    const nextStatus: EventStatus = event.status==='CONFIRMED'?'DELAYED':event.status==='DELAYED'?'CANCELLED':'CONFIRMED';
    try {await updateEvent(event.id,{artist:event.artist,space:event.space,time:event.time,status:nextStatus});setNotice('Estado actualizado.');}
    catch(error) {setNotice(error instanceof Error ? error.message : 'No se pudo actualizar el estado.');}
  };
  const remove = async (id:string) => {
    try {await deleteEvent(id);setNotice('Evento eliminado.');}
    catch(error) {setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el evento.');}
  };
  const authenticate = async () => {
    setBusy(true);
    setNotice('');
    try {
      if(authMode==='confirm') {
        const result=await confirmRegistration(email,confirmationCode);
        if(result.isSignUpComplete){setAuthMode('signIn');setNotice('Cuenta confirmada. Ya puedes iniciar sesión.');}
        else setNotice('La cuenta todavía necesita confirmación.');
      } else if(authMode==='signUp') {
        const result=await register(email,password);
        if(result.nextStep.signUpStep==='CONFIRM_SIGN_UP'){setAuthMode('confirm');setNotice('Te enviamos un código de confirmación por correo.');}
        else if(result.isSignUpComplete){setAuthMode('signIn');setNotice('Cuenta creada. Ya puedes iniciar sesión.');}
      } else {
        const result=await logIn(email,password);
        if(result.isSignedIn){const signedInUser=await getSignedInUser();setUser(signedInUser?{username:signedInUser.username}:null);setNotice('Sesión iniciada.');}
        else setNotice('Completa el paso de verificación requerido por tu cuenta.');
      }
    } catch(error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo completar la autenticación.');
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setBusy(true);
    try {await logOut();setUser(null);setPage('dashboard');setNotice('Sesión cerrada.');}
    catch(error) {setNotice(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.');}
    finally {setBusy(false);}
  };
  const confirmed = events.filter(e=>e.status==='CONFIRMED').length;
  const delayed = events.filter(e=>e.status==='DELAYED').length;
  return <SafeAreaView style={s.root}>
    <ScrollView contentContainerStyle={[s.container,wide&&{maxWidth:1160,alignSelf:'center',width:'100%'}]}>
      <View style={s.header}>
        <View><Text style={s.brand}>FESTIVAL CONTROL<Text style={{color:c.pink}}> /</Text></Text><Text style={s.kicker}>LIVE OPERATIONS · EXPO WEB</Text></View>
        <Text style={s.live}>● LIVE DEMO</Text>
      </View>
      <View style={s.nav}>
        {([['dashboard','DASHBOARD'],['events','EVENTOS'],...(user?[['form','+ NUEVO EVENTO'] as const]:[])] as const).map(([key,label])=>
          <Pressable key={key} accessibilityRole="button" onPress={()=>key==='form'?openNew():setPage(key)} style={[s.navItem,page===key&&s.navActive]}><Text style={[s.navText,page===key&&{color:c.white}]}>{label}</Text></Pressable>)}
      </View>
      <View style={s.authPanel}>
        {user ? <>
          <Text style={s.authText}>Sesión: {user.username}</Text>
          <Action label={busy?'CERRANDO...':'CERRAR SESIÓN'} secondary onPress={signOut}/>
        </> : <>
          <Text style={s.authText}>{authMode==='signUp'?'CREAR CUENTA':authMode==='confirm'?'CONFIRMAR CUENTA':'ACCESO DE ADMINISTRACIÓN'}</Text>
          {authMode!=='confirm'&&<TextInput accessibilityLabel="Correo electrónico" autoCapitalize="none" keyboardType="email-address" placeholder="Correo electrónico" placeholderTextColor="#777" style={s.input} value={email} onChangeText={setEmail}/>}
          {authMode!=='confirm'&&<TextInput accessibilityLabel="Contraseña" secureTextEntry placeholder="Contraseña (mínimo 8 caracteres)" placeholderTextColor="#777" style={s.input} value={password} onChangeText={setPassword}/>}
          {authMode==='confirm'&&<TextInput accessibilityLabel="Código de confirmación" keyboardType="number-pad" placeholder="Código de confirmación" placeholderTextColor="#777" style={s.input} value={confirmationCode} onChangeText={setConfirmationCode}/>}
          <Action label={busy?'PROCESANDO...':authMode==='confirm'?'CONFIRMAR':authMode==='signUp'?'CREAR CUENTA':'INICIAR SESIÓN'} onPress={authenticate}/>
          <Pressable accessibilityRole="button" onPress={()=>{setAuthMode(authMode==='signUp'?'signIn':'signUp');setNotice('');}}>
            <Text style={s.link}>{authMode==='confirm'?'Usa el correo donde recibiste el código':authMode==='signUp'?'Ya tengo cuenta · Iniciar sesión':'Crear una cuenta de administración'}</Text>
          </Pressable>
        </>}
      </View>
      {!!backendError&&<Text accessibilityRole="alert" style={s.error}>{backendError}</Text>}
      <View style={s.hero}>
        <Text style={s.heroTag}>ZARAGOZA · FESTIVAL OPERATIONS</Text>
        <Text style={[s.heroTitle,wide&&{fontSize:62}]}>THE WORLD{ '\n' }IS YOURS.</Text>
        <Text style={s.heroSub}>Gestiona la programación del festival en tiempo real.</Text>
      </View>
      {page==='dashboard' && <>
        <Text style={s.section}>PANEL DE CONTROL</Text>
        <View style={[s.stats,wide&&{flexDirection:'row'}]}>
          {[[String(events.length).padStart(2,'0'),'EVENTOS',c.white],[String(confirmed).padStart(2,'0'),'CONFIRMADOS',c.green],[String(delayed).padStart(2,'0'),'RETRASADOS',c.amber],['04','ESCENARIOS',c.pink]].map(([num,label,color])=><View key={label} style={[s.stat,wide&&{flex:1}]}><Text style={[s.statNumber,{color}]}>{num}</Text><Text style={s.statLabel}>{label}</Text></View>)}
        </View>
        <View style={s.sectionRow}><Text style={s.section}>PRÓXIMOS EVENTOS</Text><Pressable onPress={()=>setPage('events')}><Text style={s.link}>VER TODOS →</Text></Pressable></View>
        {events.slice(0,3).map(e=><EventCard key={e.id} event={e} canManage={!!user} onEdit={()=>openEdit(e)} onStatus={()=>changeStatus(e)} onDelete={()=>remove(e.id)}/>)}
        {events.length===0&&<Text style={s.subtitle}>Todavía no hay eventos en la programación.</Text>}
        {user&&<Action label="＋ CREAR NUEVO EVENTO" onPress={openNew}/>}
      </>}
      {page==='events' && <>
        <Text style={s.section}>PROGRAMACIÓN</Text>
        <Text style={s.subtitle}>{filtered.length} eventos · filtra y administra el festival</Text>
        <TextInput accessibilityLabel="Buscar artista o ID" placeholder="Buscar artista o ID..." placeholderTextColor="#777" style={s.input} value={search} onChangeText={setSearch}/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {['TODOS',...stages].map(v=><Pressable key={v} onPress={()=>setFilter(v)} style={[s.filter,filter===v&&s.filterActive]}><Text style={s.filterText}>{v}</Text></Pressable>)}
        </ScrollView>
        {filtered.length===0&&<Text style={s.subtitle}>No hay eventos con ese filtro.</Text>}
        {filtered.map(e=><EventCard key={e.id} event={e} canManage={!!user} onEdit={()=>openEdit(e)} onStatus={()=>changeStatus(e)} onDelete={()=>remove(e.id)}/>)}
        {user&&<Action label="＋ NUEVO EVENTO" onPress={openNew}/>}
      </>}
      {page==='form' && <>
        <Text style={s.section}>{editing?'EDITAR EVENTO':'NUEVO EVENTO'}</Text>
        <Text style={s.subtitle}>Los cambios se guardan en la base de datos del festival.</Text>
        <View style={s.form}>
          <Text style={s.label}>ARTISTA *</Text>
          <TextInput accessibilityLabel="Artista" placeholder="Ej. TECHNO TITANS" placeholderTextColor="#777" style={s.input} value={artist} onChangeText={setArtist}/>
          <Text style={s.label}>ESCENARIO</Text>
          <View style={s.choices}>{stages.map(v=><Pressable key={v} onPress={()=>setSpace(v)} style={[s.choice,space===v&&s.choiceActive]}><Text style={s.choiceText}>{v}</Text></Pressable>)}</View>
          <Text style={s.label}>HORA (HH:MM) *</Text>
          <TextInput accessibilityLabel="Hora" placeholder="21:45" placeholderTextColor="#777" style={s.input} value={time} onChangeText={setTime}/>
          <Text style={s.label}>ESTADO</Text>
          <View style={s.choices}>{statuses.map(v=><Pressable key={v} onPress={()=>setStatus(v)} style={[s.choice,status===v&&s.choiceActive]}><Text style={s.choiceText}>{v}</Text></Pressable>)}</View>
          <Action label={busy?'GUARDANDO...':editing?'GUARDAR CAMBIOS':'CREAR EVENTO'} onPress={save}/>
          <Action label="CANCELAR" secondary onPress={()=>setPage('events')}/>
        </View>
      </>}
      {!!notice && <Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}
      <View style={s.footer}><Text style={s.footerText}>FESTIVAL CONTROL · EXPO WEB · AWS AMPLIFY</Text><Text style={s.footerText}>DATOS COMPARTIDOS EN TIEMPO REAL</Text></View>
    </ScrollView>
  </SafeAreaView>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:c.background},container:{padding:20,paddingBottom:60},
  header:{paddingTop:24,paddingBottom:22,flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10},
  brand:{fontSize:20,fontWeight:'900',color:c.white,letterSpacing:1},kicker:{fontSize:10,color:c.muted,letterSpacing:2,marginTop:5},
  live:{color:c.green,fontSize:11,fontWeight:'900'},nav:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:18},
  navItem:{backgroundColor:'#191919',paddingHorizontal:15,paddingVertical:12,borderRadius:10,borderWidth:1,borderColor:c.border},
  navActive:{backgroundColor:c.pink,borderColor:c.pink},navText:{fontSize:11,fontWeight:'900',color:c.muted},
  hero:{backgroundColor:'#171018',borderColor:'#4C1934',borderWidth:1,borderRadius:22,padding:28,marginBottom:30},
  heroTag:{fontSize:11,color:c.pink,fontWeight:'900',letterSpacing:2,marginBottom:15},
  heroTitle:{fontSize:42,fontWeight:'900',color:c.white,lineHeight:51,letterSpacing:-1},
  heroSub:{color:'#B5B5B5',fontSize:14,marginTop:14,maxWidth:550,lineHeight:22},
  section:{fontSize:22,color:c.white,fontWeight:'900',marginBottom:15},sectionRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:14},
  link:{color:c.pink,fontSize:11,fontWeight:'900'},subtitle:{color:c.muted,marginBottom:18,lineHeight:22},
  stats:{gap:12,marginBottom:28},stat:{backgroundColor:c.card,borderRadius:16,borderColor:c.border,borderWidth:1,padding:22},
  statNumber:{fontSize:32,fontWeight:'900'},statLabel:{fontSize:11,fontWeight:'900',color:c.muted,marginTop:7,letterSpacing:1},
  card:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:18,padding:20,marginBottom:14},
  cardHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
  time:{color:c.pink,fontSize:16,fontWeight:'900'},status:{fontSize:11,fontWeight:'900'},
  artist:{color:c.white,fontSize:26,fontWeight:'900',marginTop:12},space:{color:c.muted,fontSize:12,fontWeight:'700',marginTop:6},
  cardActions:{flexDirection:'row',flexWrap:'wrap',gap:20,borderTopWidth:1,borderTopColor:c.border,marginTop:19,paddingTop:17},
  actionText:{color:c.pink,fontSize:11,fontWeight:'900'},
  button:{backgroundColor:c.pink,borderRadius:12,padding:17,alignItems:'center',marginTop:12},
  buttonSecondary:{backgroundColor:'#292929'},buttonDanger:{backgroundColor:'#632233'},buttonText:{color:c.white,fontWeight:'900',fontSize:12},
  input:{backgroundColor:'#171717',color:c.white,borderRadius:12,borderWidth:1,borderColor:'#383838',padding:16,marginBottom:18,fontSize:15},
  filters:{gap:8,paddingBottom:16},filter:{backgroundColor:'#242424',borderRadius:9,padding:11},filterActive:{backgroundColor:c.pink},
  filterText:{color:c.white,fontSize:10,fontWeight:'900'},form:{maxWidth:650,width:'100%'},
  label:{color:c.muted,fontWeight:'900',fontSize:11,letterSpacing:1,marginBottom:8},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:18},choice:{padding:12,borderWidth:1,borderColor:c.border,backgroundColor:c.card,borderRadius:9},
  choiceActive:{backgroundColor:'#7B1947',borderColor:c.pink},choiceText:{color:c.white,fontSize:11,fontWeight:'800'},
  notice:{marginTop:22,color:c.green,fontWeight:'800'},footer:{borderTopWidth:1,borderTopColor:c.border,marginTop:38,paddingTop:20,gap:7},
  authPanel:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:16,padding:18,marginBottom:20,gap:10},
  authText:{color:c.white,fontSize:12,fontWeight:'900',letterSpacing:1},
  error:{marginBottom:20,color:c.red,fontWeight:'800'},
  footerText:{fontSize:10,color:'#777',letterSpacing:1}
});
