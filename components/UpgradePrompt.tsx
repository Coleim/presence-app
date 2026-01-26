import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface UpgradePromptProps {
  message: string;
  onUpgrade?: () => void;
  style?: any;
}

/**
 * A friendly prompt to upgrade when limits are reached
 * Can be used inline or as a modal
 */
export function UpgradePrompt({ message, onUpgrade, style }: UpgradePromptProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <Feather name="star" size={24} color="#F59E0B" />
      </View>
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.benefit}>
          Version Premium: clubs, participants et créneaux illimités
        </Text>
      </View>
      {onUpgrade && (
        <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade}>
          <Text style={styles.upgradeButtonText}>En savoir plus</Text>
          <Feather name="arrow-right" size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginVertical: 12,
  },
  iconContainer: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  content: {
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  benefit: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  upgradeButton: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
