import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BookOpen, CalendarDays, MessageSquare, RefreshCw, Search, X, ChevronRight, ChevronDown, Layers3, FileText } from 'lucide-react-native';
import supabase from '../../supabaseClient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TABS = [{ id: 'skills', label: 'Skills', Icon: BookOpen }, { id: 'sessions', label: 'Sessions', Icon: CalendarDays }, { id: 'community', label: 'Community', Icon: MessageSquare }];
const SUB_FILTERS = { skills: ['all', 'pending', 'approved', 'rejected'], sessions: ['all', 'pending', 'completed', 'cancelled'], community: ['all', 'active', 'archived'] };
const T = { brand: '#047857', text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4', danger: '#b91c1c' , green: '#047857', strip: '#f7f9f9'};
const one = value => Array.isArray(value) ? value[0] : value;
const getItemTitle = (item, tab) => tab === 'skills' ? (item.title || 'Untitled skill') : tab === 'sessions' ? (one(item.skills)?.title || 'Unknown skill') : (item.content || 'Empty community post');
const getStatus = (item, tab) => tab === 'community' ? (item.is_active ? 'Active' : 'Archived') : (item.status || 'Unknown');
const formatDate = value => value ? new Date(value).toLocaleString() : 'Date unavailable';
const humanize = key => key.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
const getImageUrl = item => { if (item.cover_image_url) return item.cover_image_url; const urls = item.media_urls; if (!urls) return null; try { const v = typeof urls === 'string' ? JSON.parse(urls) : urls; return Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : null); } catch { return null; } };
export default function PlatformViewer() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('skills');
  const [subFilter, setSubFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [tabPickerOpen, setTabPickerOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    const fetchData = async (silent = false) => {
      if (!silent) setLoading(true);
      setErrorMessage('');
      try {
        let result;
        if (tab === 'skills') {
          let query = supabase.from('skills').select('*, user_profiles!skills_instructor_id_fkey(full_name, avatar_url)');
          if (subFilter !== 'all') query = query.eq('status', subFilter);
          result = await query.order('created_at', { ascending: false });
          if (result.error) {
            let fallbackQuery = supabase.from('skills').select('*, user_profiles(full_name, avatar_url)');
            if (subFilter !== 'all') fallbackQuery = fallbackQuery.eq('status', subFilter);
            result = await fallbackQuery.order('created_at', { ascending: false });
          }
        } else if (tab === 'sessions') {
          let query = supabase.from('sessions').select('*, student:user_profiles!sessions_student_id_fkey(full_name, avatar_url), instructor:user_profiles!sessions_instructor_id_fkey(full_name, avatar_url), skills(title)');
          if (subFilter !== 'all') query = query.eq('status', subFilter);
          result = await query.order('created_at', { ascending: false });
        } else {
          let query = supabase.from('community_posts').select('*, user_profiles!community_posts_user_id_fkey(full_name, avatar_url)');
          if (subFilter !== 'all') query = query.eq('is_active', subFilter === 'active');
          result = await query.order('created_at', { ascending: false });
          if (result.error) {
            let fallbackQuery = supabase.from('community_posts').select('*, user_profiles(full_name, avatar_url)');
            if (subFilter !== 'all') fallbackQuery = fallbackQuery.eq('is_active', subFilter === 'active');
            result = await fallbackQuery.order('created_at', { ascending: false });
          }
        }
        if (!isCurrent) return;
        if (result.error) { console.error('Platform query:', result.error); setErrorMessage('Could not load these records. Please try again.'); }
        setData(result.data || []);
      } catch (error) { console.error('Platform viewer:', error); if (isCurrent) setErrorMessage('Could not load these records. Please try again.'); }
      finally { if (isCurrent) { setLoading(false); setRefreshing(false); } }
    };
    fetchData();
    // Only the table currently being viewed; avoid subscribing to all three tabs.
    let refreshTimer;
    const onChange = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (isCurrent) fetchData(true); }, 450);
    };
    const table = tab === 'community' ? 'community_posts' : tab;
    const channel = supabase.channel(`platform_viewer_${table}_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      .subscribe();
    return () => {
      isCurrent = false;
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [tab, subFilter, reloadKey]));
  const filtered = useMemo(() => { const q = searchQuery.trim().toLowerCase(); return data.filter(item => !q || `${getItemTitle(item, tab)} ${getStatus(item, tab)}`.toLowerCase().includes(q)); }, [data, tab, searchQuery]);
  const chooseTab = next => { setTab(next); setSubFilter('all'); setSearchQuery(''); };
  const closeDetail = () => setSelectedItem(null);
  const activeTitle = TABS.find(t=>t.id===tab)?.label || 'Records';
  // UI only: mirror UserManagement's search/dropdown, chips, rows, and sheet proportions.
  const hasFilters = Boolean(searchQuery) || subFilter !== 'all';
  const clearFilters = () => { setSearchQuery(''); setSubFilter('all'); };
  const Header = (
    <View>
      {!!errorMessage && <View style={s.notice}><Text style={s.errorText}>{errorMessage}</Text><Pressable onPress={() => setReloadKey(v => v + 1)} style={s.retry}><Text style={s.retryText}>Try again</Text></Pressable></View>}
      <View style={s.searchRow}>
        <View style={s.search}>
          <Search size={18} color="#8b98a5" />
          <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder={'Search ' + activeTitle.toLowerCase()} placeholderTextColor="#8b98a5" style={s.searchInput} autoCapitalize="none" autoCorrect={false}/>
          {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={18} color="#8b98a5" /></Pressable>}
        </View>
        <Pressable onPress={() => setTabPickerOpen(true)} style={s.roleBtn}>
          <Text style={s.roleText}>{activeTitle}</Text><ChevronDown size={15} color="#8b98a5" />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {SUB_FILTERS[tab].map(filter => {
          const on = subFilter === filter;
          return <Pressable key={filter} onPress={() => setSubFilter(filter)} style={[s.chip, on && {backgroundColor:T.text}]}>
            <Text style={[s.chipText,on && {color:'#fff'}]}>{humanize(filter)}</Text>
          </Pressable>;
        })}
      </ScrollView>
      {hasFilters && !loading && <View style={s.showing}><Text style={s.detail}>Showing {filtered.length} of {data.length}</Text><Pressable onPress={clearFilters} hitSlop={8}><Text style={s.link}>Clear filters</Text></Pressable></View>}
    </View>
  );
  const renderRecord = ({item}) => {
    const state = getStatus(item,tab);
    const isPositive = /approved|completed|active/i.test(state);
    const Icon = tab === 'skills' ? BookOpen : tab === 'sessions' ? CalendarDays : MessageSquare;
    const iconBg = tab === 'skills' ? '#d1fae5' : tab === 'sessions' ? '#dbeafe' : '#ede9fe';
    const iconColor = tab === 'skills' ? '#065f46' : tab === 'sessions' ? '#1d4ed8' : '#6d28d9';
    const secondary = tab === 'skills' ? `${item.credit_cost} credits · ${item.category || 'No category'}` : tab === 'sessions' ? `${item.credit_amount} credits · ${item.scheduled_date}` : (item.post_type || 'General Q&A');
    return <Pressable onPress={() => setSelectedItem(item)} style={({pressed})=>[s.row,pressed && {backgroundColor:'#ecfdf5'}]}>
      <View style={[s.accent,{backgroundColor:isPositive?'#10b981':'#f59e0b'}]}/>
      <View style={[s.avatar,{backgroundColor:iconBg}]}><Icon size={20} color={iconColor}/></View>
      <View style={{flex:1}}>
        <Text style={s.itemName} numberOfLines={1}>{getItemTitle(item,tab)}</Text>
        <Text style={s.detail} numberOfLines={1}>{secondary}</Text>
        <Text style={[s.detail,{color:'#8b98a5'}]} numberOfLines={1}>{formatDate(item.created_at)}</Text>
      </View>
      <View style={{alignItems:'flex-end',gap:4}}>
        <View style={[s.badge,{backgroundColor:isPositive?'#ecfdf5':'#f3f4f6'}]}>
          <View style={[s.badgeDot,{backgroundColor:isPositive?'#10b981':'#9ca3af'}]}/>
          <Text style={[s.badgeText,{color:isPositive?'#047857':'#6b7280'}]}>{state}</Text>
        </View>
        <ChevronRight size={17} color="#cfd9de" />
      </View>
    </Pressable>;
  };
  return <View style={s.root}>
    <FlatList
      data={filtered} keyExtractor={item=>String(item.id)}
      ListHeaderComponent={Header} renderItem={renderRecord}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      contentContainerStyle={{paddingBottom:40}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true);setReloadKey(v=>v+1);}} tintColor={T.brand} colors={[T.brand]}/>}
      ListEmptyComponent={loading ? <ActivityIndicator style={{marginVertical:48}} color={T.brand}/> : <View style={s.empty}><Layers3 size={38} color="#cfd9de"/><Text style={[s.itemName,{marginTop:10}]}>No records found</Text><Text style={s.detail}>Try changing your search or filters.</Text>{hasFilters && <Pressable onPress={clearFilters} style={s.clearBtn}><Text style={s.clearText}>Clear filters</Text></Pressable>}</View>}
    />
    <Modal visible={tabPickerOpen} transparent animationType="slide" onRequestClose={()=>setTabPickerOpen(false)}>
      <View style={s.modalRoot}><Pressable style={s.overlay} onPress={()=>setTabPickerOpen(false)}/>
        <View style={[s.sheet,{paddingBottom:insets.bottom+14}]}><View style={s.grabber}/>
          <Text style={s.sheetTitle}>View platform records</Text>
          {TABS.map(({id,label,Icon})=><Pressable key={id} onPress={()=>{chooseTab(id);setTabPickerOpen(false);}} style={s.pickRow}>
            <Icon size={20} color={tab===id?T.brand:T.sub}/><Text style={[s.pickText,{flex:1},tab===id && {color:T.brand}]}>{label}</Text>{tab===id && <Text style={s.link}>Selected</Text>}
          </Pressable>)}
        </View>
      </View>
    </Modal>
    <Modal visible={!!selectedItem} transparent animationType="slide" onRequestClose={closeDetail}>
      <View style={s.modalRoot}><Pressable style={s.overlay} onPress={closeDetail}/>
      {!!selectedItem && <View style={[s.sheet,{paddingBottom:insets.bottom+14}]}>
        <View style={s.grabber}/>
        <View style={s.sheetHead}>
          <View style={[s.avatar,{width:48,height:48,backgroundColor:'#d1fae5'}]}><FileText size={22} color={T.brand}/></View>
          <View style={{flex:1}}><Text style={s.lane} numberOfLines={1}>{getItemTitle(selectedItem,tab)}</Text><Text style={s.detail}>{activeTitle} · Read-only view</Text></View>
          <Pressable onPress={closeDetail} hitSlop={10}><X size={21} color={T.sub}/></Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={{flexShrink:1}} contentContainerStyle={{paddingBottom:12}}>
          {!!getImageUrl(selectedItem) && <Image source={{uri:getImageUrl(selectedItem)}} resizeMode="cover" style={s.preview}/>}
          <Text style={[s.detail,{paddingVertical:10}]}>Created {formatDate(selectedItem.created_at)}</Text>
          {Object.entries(selectedItem).filter(([key,value])=>value!==null && !['media_urls','cover_image_url'].includes(key) && ['string','number','boolean'].includes(typeof value)).map(([key,value])=><View key={key} style={s.dRow}>
            <Text style={s.detail}>{humanize(key)}</Text><Text selectable style={s.dVal}>{String(value)}</Text>
          </View>)}
        </ScrollView>
        <Pressable onPress={closeDetail} style={s.grayBtn}><Text style={s.closeText}>Close</Text></Pressable>
      </View>}</View>
    </Modal>
  </View>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#fff'},
  lane:{fontSize:17,fontWeight:'700',color:T.text,letterSpacing:-0.2},
  itemName:{fontSize:15,fontWeight:'600',color:T.text},
  detail:{fontSize:13,color:T.sub,lineHeight:18},
  link:{fontSize:13,fontWeight:'700',color:T.brand},
  notice:{flexDirection:'row',alignItems:'center',gap:10,marginHorizontal:16,marginTop:12,backgroundColor:'#fff1f2',borderRadius:12,padding:12},
  errorText:{flex:1,fontSize:14,fontWeight:'600',color:'#9f1239'},
  retry:{backgroundColor:'#be123c',borderRadius:14,paddingHorizontal:12,height:30,alignItems:'center',justifyContent:'center'},
  retryText:{color:'#fff',fontSize:13,fontWeight:'700'},
  searchRow:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingTop:12},
  search:{flex:1,flexDirection:'row',alignItems:'center',gap:8,height:42,borderRadius:21,backgroundColor:'#eff3f4',paddingHorizontal:14},
  searchInput:{flex:1,fontSize:15,color:T.text,paddingVertical:0},
  roleBtn:{flexDirection:'row',alignItems:'center',gap:4,height:42,paddingHorizontal:12,borderRadius:21,backgroundColor:'#eff3f4'},
  roleText:{fontSize:13,fontWeight:'600',color:T.sub},
  chips:{gap:8,paddingHorizontal:16,paddingVertical:12},
  chip:{flexDirection:'row',alignItems:'center',gap:6,height:34,paddingHorizontal:14,borderRadius:17,backgroundColor:'#eff3f4'},
  chipText:{fontSize:13,fontWeight:'600',color:T.sub},
  showing:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingBottom:8},
  row:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:12,borderBottomWidth:1,borderBottomColor:T.line},
  accent:{position:'absolute',left:0,top:0,bottom:0,width:3},
  avatar:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  badge:{flexDirection:'row',alignItems:'center',gap:5,height:24,paddingHorizontal:9,borderRadius:12},
  badgeDot:{width:7,height:7,borderRadius:4},
  badgeText:{fontSize:12,fontWeight:'700'},
  empty:{alignItems:'center',paddingVertical:56,paddingHorizontal:24},
  clearBtn:{marginTop:14,height:40,paddingHorizontal:18,borderRadius:20,borderWidth:1,borderColor:'#cfd9de',alignItems:'center',justifyContent:'center'},
  clearText:{fontSize:14,fontWeight:'700',color:T.text},
  modalRoot:{flex:1,justifyContent:'flex-end'},
  overlay:{flex:1,backgroundColor:'rgba(15,20,25,0.5)'},
  sheet:{backgroundColor:'#fff',borderTopLeftRadius:20,borderTopRightRadius:20,paddingHorizontal:16,paddingTop:8,maxHeight:'88%'},
  grabber:{alignSelf:'center',width:40,height:4,borderRadius:2,backgroundColor:'#cfd9de',marginBottom:8},
  sheetTitle:{fontSize:17,fontWeight:'700',color:T.text,marginTop:4,marginBottom:2,letterSpacing:-0.2},
  sheetHead:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10,marginBottom:4,borderBottomWidth:1,borderBottomColor:T.line},
  pickRow:{flexDirection:'row',alignItems:'center',gap:14,height:52,borderBottomWidth:1,borderBottomColor:T.line},
  pickText:{fontSize:16,fontWeight:'600',color:T.text},
  dRow:{paddingVertical:12,borderTopWidth:1,borderTopColor:T.line},
  dVal:{fontSize:15,fontWeight:'600',color:T.text,marginTop:3},
  preview:{height:170,borderRadius:12,marginVertical:12},
  grayBtn:{height:48,borderRadius:24,backgroundColor:'#eff3f4',alignItems:'center',justifyContent:'center',marginTop:8},
  closeText:{fontSize:16,fontWeight:'700',color:T.text},
});
