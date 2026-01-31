import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ClubListScreen from '../../screens/ClubListScreen';
import { dataService } from '../../lib/dataService';

// Mock dependencies
jest.mock('../../lib/dataService');
jest.mock('../../contexts/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ClubListScreen Tests', () => {
  const mockNavigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    replace: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Club List Display', () => {
    it('should display list of clubs', async () => {
      const mockClubs = [
        {
          id: 'club-1',
          name: 'Soccer Club',
          owner_id: 'owner-1',
        },
        {
          id: 'club-2',
          name: 'Basketball Club',
          owner_id: 'owner-2',
        },
      ];

      (dataService.getClubs as jest.Mock).mockResolvedValue(mockClubs);

      const { getByText } = render(
        <ClubListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Soccer Club')).toBeTruthy();
        expect(getByText('Basketball Club')).toBeTruthy();
      });
    });

    it('should show empty state when no clubs exist', async () => {
      (dataService.getClubs as jest.Mock).mockResolvedValue([]);

      const { getByText } = render(
        <ClubListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('home.noClubs')).toBeTruthy();
      });
    });

    it('should navigate to club details when club is tapped', async () => {
      const mockClub = {
        id: 'club-1',
        name: 'Soccer Club',
        owner_id: 'owner-1',
      };

      (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);

      const { getByText } = render(
        <ClubListScreen navigation={mockNavigation} />
      );

      await waitFor(() => {
        expect(getByText('Soccer Club')).toBeTruthy();
      });

      const clubItem = getByText('Soccer Club');
      fireEvent.press(clubItem);

      expect(mockNavigation.navigate).toHaveBeenCalledWith('ClubDetails', {
        club: mockClub,
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to create club screen', async () => {
      (dataService.getClubs as jest.Mock).mockResolvedValue([]);

      const { getByText } = render(
        <ClubListScreen navigation={mockNavigation} />
      );

      const createButton = getByText('home.createClub');
      fireEvent.press(createButton);

      expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateClub');
    });

    it('should navigate to join club screen', async () => {
      (dataService.getClubs as jest.Mock).mockResolvedValue([]);

      const { getByText } = render(
        <ClubListScreen navigation={mockNavigation} />
      );

      const joinButton = getByText('home.joinClub');
      fireEvent.press(joinButton);

      expect(mockNavigation.navigate).toHaveBeenCalledWith('JoinClub');
    });

    it('should auto-navigate to club details when only one club exists', async () => {
      const mockClub = {
        id: 'club-1',
        name: 'Only Club',
        owner_id: 'owner-1',
      };

      (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);

      render(<ClubListScreen navigation={mockNavigation} />);

      await waitFor(() => {
        expect(mockNavigation.replace).toHaveBeenCalledWith('ClubDetails', {
          club: mockClub,
        });
      });
    });
  });

  describe('Screen Focus Behavior', () => {
    it('should refresh clubs when screen comes into focus', async () => {
      const mockClubs = [
        { id: 'club-1', name: 'Club 1', owner_id: 'owner-1' },
      ];

      (dataService.getClubs as jest.Mock).mockResolvedValue(mockClubs);

      let focusListener: () => void = () => {};
      (mockNavigation.addListener as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'focus') {
          focusListener = callback;
        }
        return jest.fn();
      });

      render(<ClubListScreen navigation={mockNavigation} />);

      await waitFor(() => {
        expect(dataService.getClubs).toHaveBeenCalledTimes(1);
      });

      // Simulate screen focus
      focusListener();

      await waitFor(() => {
        expect(dataService.getClubs).toHaveBeenCalledTimes(2);
      });
    });
  });
});
