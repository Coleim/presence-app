/**
 * EXAMPLES: How to integrate usage limits in your app
 * 
 * This file shows practical examples of where and how to display
 * the usage limits in a user-friendly, non-intrusive way.
 */

// ============================================
// EXAMPLE 1: CreateClubScreen
// ============================================
// Before allowing club creation, check if user has reached limit

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { authManager } from '../lib/authManager';
import { usageService } from '../lib/usageService';
import { hasReachedClubLimit, getLimitMessage, USAGE_LIMITS } from '../lib/usageLimits';
import { UpgradePrompt } from '../components/UpgradePrompt';

function CreateClubScreenExample() {
  const [canCreateClub, setCanCreateClub] = useState(true);
  const [clubsOwned, setClubsOwned] = useState(0);

  useEffect(() => {
    checkClubLimit();
  }, []);

  const checkClubLimit = async () => {
    const userId = await authManager.getUserId();
    if (!userId) return;

    const stats = await usageService.getUserUsageStats(userId);
    setClubsOwned(stats.clubsOwned);
    setCanCreateClub(!hasReachedClubLimit(stats.clubsOwned));
  };

  const handleCreateClub = () => {
    if (!canCreateClub) {
      Alert.alert(
        'Limite atteinte',
        getLimitMessage('club') + '\n\nPassez à la version Premium pour créer des clubs illimités.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'En savoir plus', onPress: () => {/* Navigate to upgrade */ } }
        ]
      );
      return;
    }
    // Continue with club creation...
  };

  return (
    <View>
      {/* Show upgrade prompt if limit reached */}
      {!canCreateClub && (
        <UpgradePrompt
          message={getLimitMessage('club')}
          onUpgrade={() => {/* Navigate to upgrade screen */}}
        />
      )}
      
      {/* Show subtle info about limit */}
      {canCreateClub && (
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>
          Version gratuite: {clubsOwned}/{USAGE_LIMITS.CLUBS_PER_USER} club utilisé
        </Text>
      )}

      <TouchableOpacity 
        onPress={handleCreateClub}
        disabled={!canCreateClub}
      >
        <Text>Créer un club</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================
// EXAMPLE 2: AddParticipantScreen
// ============================================
// Show progress bar as users add participants

import { UsageBadge } from '../components/UsageBadge';

function AddParticipantScreenExample({ clubId }) {
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    loadParticipantCount();
  }, [clubId]);

  const loadParticipantCount = async () => {
    const stats = await usageService.getClubUsageStats(clubId);
    setParticipantCount(stats.participants);
  };

  const handleAddParticipant = async () => {
    // Check limit before adding
    if (participantCount >= USAGE_LIMITS.PARTICIPANTS_PER_CLUB) {
      Alert.alert(
        'Limite atteinte',
        getLimitMessage('participants') + '\n\nPassez à la version Premium pour des participants illimités.'
      );
      return;
    }
    // Continue with adding participant...
  };

  return (
    <View>
      {/* Show usage badge - subtle and informative */}
      <UsageBadge
        current={participantCount}
        limit={USAGE_LIMITS.PARTICIPANTS_PER_CLUB}
        label="Participants dans ce club"
      />

      {/* Show upgrade prompt when approaching limit */}
      {participantCount >= USAGE_LIMITS.PARTICIPANTS_PER_CLUB * 0.8 && (
        <UpgradePrompt
          message={
            participantCount >= USAGE_LIMITS.PARTICIPANTS_PER_CLUB
              ? getLimitMessage('participants')
              : `Vous approchez de la limite (${participantCount}/${USAGE_LIMITS.PARTICIPANTS_PER_CLUB})`
          }
        />
      )}

      <TouchableOpacity onPress={handleAddParticipant}>
        <Text>Ajouter un participant</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================
// EXAMPLE 3: HomeScreen - Show club stats
// ============================================
// Display usage as a small badge on the home screen

function HomeScreenExample() {
  const [stats, setStats] = useState({ clubsOwned: 0, clubMemberships: 0 });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const userId = await authManager.getUserId();
    if (!userId) return;
    const userStats = await usageService.getUserUsageStats(userId);
    setStats(userStats);
  };

  return (
    <View>
      {/* Subtle badge in header or corner */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text>Mes clubs</Text>
        {stats.clubsOwned > 0 && (
          <UsageBadge
            current={stats.clubsOwned}
            limit={USAGE_LIMITS.CLUBS_PER_USER}
            compact
          />
        )}
      </View>
    </View>
  );
}

// ============================================
// EXAMPLE 4: ClubDetailsScreen
// ============================================
// Show both participants and sessions limits

function ClubDetailsScreenExample({ clubId }) {
  const [clubStats, setClubStats] = useState({ participants: 0, sessions: 0 });

  useEffect(() => {
    loadClubStats();
  }, [clubId]);

  const loadClubStats = async () => {
    const stats = await usageService.getClubUsageStats(clubId);
    setClubStats(stats);
  };

  return (
    <View>
      {/* Show stats in a card */}
      <View style={{ backgroundColor: '#F9FAFB', padding: 16, borderRadius: 8 }}>
        <Text style={{ fontWeight: '600', marginBottom: 12 }}>
          Utilisation du club
        </Text>
        
        <UsageBadge
          current={clubStats.participants}
          limit={USAGE_LIMITS.PARTICIPANTS_PER_CLUB}
          label="Participants"
        />
        
        <UsageBadge
          current={clubStats.sessions}
          limit={USAGE_LIMITS.SESSIONS_PER_CLUB}
          label="Créneaux horaires"
        />

        {/* Show upgrade prompt if any limit is reached */}
        {(clubStats.participants >= USAGE_LIMITS.PARTICIPANTS_PER_CLUB ||
          clubStats.sessions >= USAGE_LIMITS.SESSIONS_PER_CLUB) && (
          <UpgradePrompt
            message="Passez à Premium pour des clubs illimités !"
            onUpgrade={() => {/* Navigate to upgrade */}}
            style={{ marginTop: 12 }}
          />
        )}
      </View>
    </View>
  );
}

// ============================================
// TIPS FOR GOOD UX:
// ============================================
/*
1. Show limits BEFORE users hit them (progress bars)
2. Make upgrade prompts friendly, not annoying
3. Only show upgrade prompt when relevant (don't spam)
4. Use colors: green → yellow → red as they approach limits
5. Always provide clear path to upgrade
6. Store "upgrade screen shown" to avoid showing too often
7. Consider showing benefits of premium, not just limits
*/

export {};
