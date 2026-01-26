import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getUsagePercentage, shouldShowWarning } from '../lib/usageLimits';

interface UsageBadgeProps {
  current: number;
  limit: number;
  label?: string;
  compact?: boolean;
}

/**
 * A subtle badge showing usage progress (e.g., "3/30 participants")
 * Changes color when approaching limit
 */
export function UsageBadge({ current, limit, label, compact = false }: UsageBadgeProps) {
  const isWarning = shouldShowWarning(current, limit);
  const isAtLimit = current >= limit;
  const percentage = getUsagePercentage(current, limit);

  const getColor = () => {
    if (isAtLimit) return '#EF4444'; // Red
    if (isWarning) return '#F59E0B'; // Orange
    return '#10B981'; // Green
  };

  if (compact) {
    return (
      <View style={[styles.compactBadge, { backgroundColor: `${getColor()}15` }]}>
        <Text style={[styles.compactText, { color: getColor() }]}>
          {current}/{limit}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${percentage}%`, backgroundColor: getColor() }
            ]} 
          />
        </View>
        <Text style={[styles.count, { color: getColor() }]}>
          {current}/{limit}
        </Text>
      </View>
      {isAtLimit && (
        <View style={styles.warningRow}>
          <Feather name="alert-circle" size={12} color="#EF4444" />
          <Text style={styles.warningText}>Limite atteinte</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 45,
    textAlign: 'right',
  },
  compactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  compactText: {
    fontSize: 11,
    fontWeight: '600',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  warningText: {
    fontSize: 11,
    color: '#EF4444',
  },
});
