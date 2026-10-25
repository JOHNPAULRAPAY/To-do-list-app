import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  StatusBar as RNStatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { supabase } from './utils/supabase';
import { AuthScreen } from './components/AuthScreen';

export interface Todo {
  id: number;
  title: string;
  is_complete: boolean;
  created_at: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tableExists, setTableExists] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Check initial authentication state and subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch todos from Supabase
  const fetchTodos = useCallback(async (isRefresh = false) => {
    if (!session) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        if (error.code === 'PGRST205') {
          // Table not created yet in Supabase
          setTableExists(false);
        } else {
          console.error('Fetch error:', error.message);
          Alert.alert('Error', error.message);
        }
      } else {
        setTableExists(true);
        setTodos(data || []);
      }
    } catch (err: any) {
      console.error('Unexpected error:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;

    fetchTodos();

    // Set up Realtime listener for todo changes
    const channel = supabase
      .channel('public:todos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos' },
        () => {
          fetchTodos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, fetchTodos]);

  // Add a new todo
  const addTodo = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('todos')
        .insert([{ title: trimmed, is_complete: false }])
        .select()
        .single();

      if (error) {
        Alert.alert('Failed to add todo', error.message);
      } else if (data) {
        setTodos((prev) => [data, ...prev]);
        setInputText('');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add item');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle todo completion
  const toggleComplete = async (id: number, currentStatus: boolean) => {
    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_complete: !currentStatus } : t))
    );

    try {
      const { error } = await supabase
        .from('todos')
        .update({ is_complete: !currentStatus })
        .eq('id', id);

      if (error) {
        // Rollback on failure
        Alert.alert('Update failed', error.message);
        fetchTodos();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message);
      fetchTodos();
    }
  };

  // Delete a todo
  const deleteTodo = async (id: number) => {
    // Optimistic update
    setTodos((prev) => prev.filter((t) => t.id !== id));

    try {
      const { error } = await supabase.from('todos').delete().eq('id', id);
      if (error) {
        Alert.alert('Delete failed', error.message);
        fetchTodos();
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message);
      fetchTodos();
    }
  };

  // Filtered todos list
  const filteredTodos = todos.filter((item) => {
    if (activeFilter === 'active') return !item.is_complete;
    if (activeFilter === 'completed') return item.is_complete;
    return true;
  });

  const completedCount = todos.filter((t) => t.is_complete).length;
  const activeCount = todos.length - completedCount;

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          setTodos([]);
        },
      },
    ]);
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <StatusBar style="light" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Loading TaskFlow...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <StatusBar style="light" />
        <AuthScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="checkbox" size={28} color="#38bdf8" />
              <Text style={styles.headerTitle}>TaskFlow</Text>
            </View>
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}
              accessibilityLabel="Sign out"
            >
              <Ionicons name="log-out-outline" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSubtitle}>
            {session.user.email ? `Logged in as ${session.user.email}` : 'Powered by Supabase & React Native'}
          </Text>

          {/* Stats Bar */}
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{todos.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#fbbf24' }]}>{activeCount}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: '#34d399' }]}>{completedCount}</Text>
              <Text style={styles.statLabel}>Done</Text>
            </View>
          </View>
        </View>

        {/* Notice banner if Supabase table is not yet created */}
        {!tableExists && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle" size={20} color="#f59e0b" />
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningTitle}>Table 'todos' not found</Text>
              <Text style={styles.warningDesc}>
                Run the script in <Text style={styles.codeHighlight}>supabase_setup.sql</Text> in your Supabase SQL editor to create the table.
              </Text>
            </View>
            <TouchableOpacity onPress={() => fetchTodos()} style={styles.retryButton}>
              <Ionicons name="reload" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="What needs to be done?"
            placeholderTextColor="#64748b"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={addTodo}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addButton, submitting && styles.buttonDisabled]}
            onPress={addTodo}
            disabled={submitting || !inputText.trim()}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="add" size={24} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterBar}>
          {(['all', 'active', 'completed'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[
                styles.filterPill,
                activeFilter === filter && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter && styles.filterTextActive,
                ]}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Todo List */}
        {loading && !refreshing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={styles.loadingText}>Syncing tasks...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredTodos}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchTodos(true)}
                tintColor="#38bdf8"
                colors={['#38bdf8']}
              />
            }
            contentContainerStyle={
              filteredTodos.length === 0 ? styles.emptyListContainer : styles.listContent
            }
            renderItem={({ item }) => (
              <View style={styles.todoCard}>
                <TouchableOpacity
                  style={styles.todoCheckArea}
                  onPress={() => toggleComplete(item.id, item.is_complete)}
                >
                  <Ionicons
                    name={item.is_complete ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={item.is_complete ? '#34d399' : '#64748b'}
                  />
                  <Text
                    style={[
                      styles.todoTitle,
                      item.is_complete && styles.todoTitleCompleted,
                    ]}
                  >
                    {item.title}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteTodo(item.id)}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="list" size={48} color="#334155" />
                <Text style={styles.emptyTitle}>No tasks found</Text>
                <Text style={styles.emptySubtitle}>
                  {activeFilter === 'all'
                    ? 'Add a new task using the input field above'
                    : `No ${activeFilter} tasks currently`}
                </Text>
              </View>
            }
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signOutButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
    marginBottom: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#38bdf8',
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#334155',
  },
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: '#451a03',
    borderColor: '#b45309',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    alignItems: 'center',
    gap: 10,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '600',
  },
  warningDesc: {
    color: '#fed7aa',
    fontSize: 12,
    marginTop: 2,
  },
  codeHighlight: {
    fontWeight: '700',
    color: '#ffffff',
  },
  retryButton: {
    backgroundColor: '#b45309',
    padding: 8,
    borderRadius: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  addButton: {
    backgroundColor: '#0284c7',
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    gap: 8,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  filterText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  todoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  todoCheckArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  todoTitle: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
  },
  todoTitleCompleted: {
    color: '#64748b',
    textDecorationLine: 'line-through',
  },
  deleteButton: {
    padding: 6,
    borderRadius: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 10,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
});
