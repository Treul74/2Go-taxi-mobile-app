import React, { useState } from 'react';
import { View, Text, ScrollView, StatusBar, Image, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { BackButton, Input, Button } from '@/components/ui';
import { updateSharedProfilePhoto } from '@/services';
import { useUserStore } from '@/state';

/**
 * Profile edit screen
 * Allows users to view and edit their profile information
 */
export default function ProfileScreen() {
  const { profile, updateProfile, applySharedProfilePhoto } = useUserStore();

  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [email, setEmail] = useState(profile.email || '');
  const [phone, setPhone] = useState(profile.phone);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleSave = () => {
    updateProfile({
      firstName,
      lastName,
      email: email || undefined,
      phone,
    });
    router.back();
  };
  
  // Replaces the SHARED avatar: the customer profile and any driver profile
  // still linked to it both pick up the new photo (a driver-specific photo
  // is left alone). Storage + both DB rows are handled by the service; the
  // store action mirrors the same rules into local state.
  const handleChangePhoto = async () => {
    if (uploadingPhoto) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    setUploadingPhoto(true);
    const { document, errorMessage } = await updateSharedProfilePhoto(asset.uri, {
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
    });
    setUploadingPhoto(false);

    if (errorMessage || !document) {
      Alert.alert('Could not update photo', errorMessage ?? 'Please try again.');
      return;
    }
    applySharedProfilePhoto(document.url, document.key);
  };
  
  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#E7F1F9" />
      
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4">
          <BackButton onPress={() => router.back()} />
          <Text className="text-primary font-bold text-lg">
            Edit Profile
          </Text>
          <View className="w-10" />
        </View>
        
        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Profile Photo */}
          <View className="items-center mt-6 mb-8">
            <View className="relative">
              <View className="w-28 h-28 rounded-full bg-primary items-center justify-center overflow-hidden">
                {profile.avatar ? (
                  <Image
                    source={{ uri: profile.avatar }}
                    className="w-28 h-28 rounded-full"
                    resizeMode="cover"
                  />
                ) : (
                  <Text className="text-white text-4xl font-bold">
                    {profile.firstName.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              
              <Pressable
                onPress={handleChangePhoto}
                disabled={uploadingPhoto}
                className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-accent items-center justify-center border-4 border-white"
              >
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="camera" size={18} color="#FFFFFF" />
                )}
              </Pressable>
            </View>

            <Pressable onPress={handleChangePhoto} disabled={uploadingPhoto} className="mt-3">
              <Text className="text-accent font-semibold">
                {uploadingPhoto ? 'Uploading…' : 'Change Photo'}
              </Text>
            </Pressable>
          </View>
          
          {/* Form Fields */}
          <View className="gap-4">
            <Input
              label="First Name"
              placeholder="Enter your first name"
              leftIcon="person-outline"
              value={firstName}
              onChangeText={setFirstName}
            />

            <Input
              label="Last Name"
              placeholder="Enter your last name"
              leftIcon="person-outline"
              value={lastName}
              onChangeText={setLastName}
            />

            <Input
              label="Phone Number"
              placeholder="+260 XX XXX XXXX"
              leftIcon="call-outline"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            
            <Input
              label="Email (Optional)"
              placeholder="your.email@example.com"
              leftIcon="mail-outline"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          
          {/* Rating Display */}
          <View className="mt-6 p-4 bg-gray-50 rounded-3xl">
            <View className="flex-row items-center justify-between">
              <Text className="text-secondary text-sm">
                Your Rating
              </Text>
              <View className="flex-row items-center">
                <Ionicons name="star" size={18} color="#FFB800" />
                <Text className="text-primary font-bold text-lg ml-1">
                  {profile.rating.toFixed(1)}
                </Text>
              </View>
            </View>
          </View>
          
          {/* Save Button */}
          <View className="mt-8">
            <Button
              variant="accent"
              size="lg"
              fullWidth
              onPress={handleSave}
            >
              Save Changes
            </Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

